importScripts('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@2.6.0/dist/tf.min.js');

(async () => {
  const ZOOM_MULT = 2 ** (1/2);
  const RATIO = 128 / 64;

  const startedDownload = Date.now();
  const model = await tf.loadLayersModel('/assets/anpr/model.json', {
    onProgress(percentDownloaded) {
      postMessage({
        type: 'loading',
        content: {
          percentDownloaded,
          willFinishIn: (Date.now() - startedDownload) / percentDownloaded,
        }
      });
    }
  });
  const mapped = await (await fetch('/assets/anpr/map.json')).json();

  const decoder = output => {
    let label = '';
    let offset = 0;
    for (const letters of mapped) {
      const sliced = output.slice(offset, letters.length);
      const index = sliced.argMax().arraySync();
      label += letters[index];
      offset += letters.length;
    }
    return label
  }

  const getPossibleLabel = (current, nextChars, labels) => {
    if (nextChars.length > 0) {
      for (const char of nextChars[0]) {
        getPossibleLabel(current+char, nextChars.slice(1), labels);
      }
      return labels;
    } else {
      labels.push(current);
    }
  }

  const predict = async ({ stream, slideStep, maxZoomExp }) => { // TODO Do not use async
    const start = Date.now();
    let last = start;
    let timesSum = 0;

    const output = [];
    const divider = tf.scalar(255);

    for (const index in stream) {
      const frame = stream[index];
      const buffer = [];
      const out = [];
      const w = frame.width, h = frame.height;
      let width, height;

      if (w / h < RATIO) {
        width = w;
        height = width / RATIO;
      } else {
        height = h;
        width = height * RATIO;
      }
      width = Math.floor(width)
      height = Math.floor(height);

      let zoom = 1;
      const max_zoom = 2 ** (maxZoomExp/2);
      while (zoom <= max_zoom) {
        const scaled_w = Math.floor(w * zoom), scaled_h = Math.floor(h * zoom);

        const overflow_x = Math.abs(width - scaled_w), overflow_y = Math.abs(height - scaled_h);
        const coeff = w / scaled_w;

        const copied = new OffscreenCanvas(scaled_w, scaled_h);
        const copiedContext = copied.getContext('2d');
        copiedContext.scale(zoom, zoom);
        copiedContext.drawImage(frame, 0, 0);

        const step = Math.floor(slideStep / 128 * scaled_w);
        for (let i = 0; i <= overflow_x; i += step) {
          for (let j = 0; j <= overflow_y; j += step) {
            out.push([[Math.floor(i * coeff), Math.floor(j * coeff)], [Math.floor(width * coeff), Math.floor(height * coeff)]]);
            const slicedImageBitmap = await createImageBitmap(copied, i, j, width, height);
            const sliced = new OffscreenCanvas(128, 64);
            const slicedContext = sliced.getContext('2d');
            slicedContext.scale(128/slicedImageBitmap.width, 64/slicedImageBitmap.height);
            slicedContext.drawImage(slicedImageBitmap, 0, 0);
            buffer.push(tf.tidy(() => tf.browser.fromPixels(sliced).mean(2).toFloat().expandDims(-1).div(divider).reshape([1, 128, 64, 1])));
          }
        }
        zoom *= ZOOM_MULT;
      }

      const predictions = tf.tidy(() => model.predict(tf.concat(buffer)));
      for (let i = 0; i < predictions.shape[0]; i++) {
        const label = tf.tidy(() => {
          const prediction = predictions.gather([i]).reshape([predictions.shape[1]]);
          const isPlate = prediction.slice(0, 2).argMax().arraySync();
          return isPlate ? decoder(prediction) : null;
        });
        if (label) {
          out[i] = [out[i], label];
        } else {
          out[i] = null;
        }
      }
      const valid = out.filter(bbox => bbox);

      for (const tensor of buffer) {
        tensor.dispose();
      }
      predictions.dispose();

      const groups = [];
      for (let i = 0; i < valid.length; i++) {
        for (let j = i + 1; j < valid.length; j++) {
          const [bbox0, bbox1] = [valid[i][0], valid[j][0]];
          // TODO Fix overlapping check
          const areOverlapping = Math.max(bbox0[0][0], bbox1[0][0]) < Math.min(bbox0[0][0]+bbox0[1][0], bbox1[0][0]+bbox1[1][0]) && Math.max(bbox0[0][1], bbox1[0][1]) < Math.min(bbox0[0][1]+bbox0[1][1], bbox1[0][1]+bbox1[1][1]);
          if (areOverlapping) {
            let appended = false;
            for (const group of groups) {
              if (!group.find(item => item === i)) {
                group.push(i);
                appended = true;
              }
              if (!group.find(item => item === j)) {
                group.push(j);
                appended = true;
              }
            }
            if (!appended) {
              groups.push([i, j]);
            }
          }
        }
      }

      for (let i = 0; i < valid.length; i++) {
        let isInGroup = false;
        for (const group of groups) {
          if (group.find(item => item === i)) {
            isInGroup = true;
            break;
          }
        }
        if (!isInGroup) {
          groups.push([i]);
        }
      }

      const grouped = [];
      for (const group of groups) {
        const length = group.length;
        if (length === 1) {
          console.log('Unsure about group with a weak match: ' + valid[group[0]]);
          continue;
        }
        
        let top = 0, height = 0, left = 0, width = 0;
        const letters = [[], [], [], [], [], [], [], [], [], [], []];
        for (const index of group) {
          left += valid[index][0][0][0];
          width += valid[index][0][1][0];
          top += valid[index][0][0][1];
          height += valid[index][0][1][1];
          for (const i in valid[index][1]) {
            letters[i].push(valid[index][1][i]);
          }
        }

        const maxProbs = [];
        for (const letter of letters) {
          const counter = {};
          for (const possibleLetter of letter) {
            if (counter[possibleLetter] === undefined) {
              counter[possibleLetter] = 1;
            } else {
              counter[possibleLetter] += 1;
            }
          }
          const sorted = Object.entries(counter).sort((a, b) => b[1] - a[1]);
          const maxProb = sorted[0][1];
          const withMaxProb = [];
          for (const pair of sorted) {
            if (pair[1] === maxProb) {
              withMaxProb.push(pair[0]);
            } else if (pair[1] < maxProb) {
              break;
            }
          }
          maxProbs.push(withMaxProb);
        }

        const possible = getPossibleLabel('', maxProbs, []);
        if (possible.length >= Math.floor(length / 2)) {
          console.log('Unsure about group with labels: ' + possible);
          grouped.push([[[left/length, top/length],[width/length, height/length]], null, 1]);
        } else {
          grouped.push([[[left/length,top/length],[width/length,height/length]], possible.map(label => label.trim().slice(3)).join('/')]);
        }
      }
      output.push(grouped);

      const now = Date.now();
      timesSum += now - last;
      last = now;
      const next = Number(index) + 1;
      const took = Math.floor((now - start) / 1000);
      const willTake = Math.floor((timesSum / next) * (stream.length - next) / 1000);
      postMessage({
        type: 'status',
        content: {
          percent: Math.floor(next/stream.length*100),
          done: next,
          toDo: stream.length,
          took: [Math.floor(took / 60), took % 60],
          willTake: [Math.floor(willTake / 60), willTake % 60],
          average: Math.floor(timesSum / next),
          found: output[index].length,
        }
      })
    }
    divider.dispose();
    return output;
  }

  onmessage = ({ data: { type, content } }) => {
    if (type === 'arguments') {
      predict(content).then(output => {
        postMessage({
          type: 'result',
          content: {
            output
          }
        });
      });
    }
  };

  postMessage({
    type: 'ready',
    content: true,
  });

})().catch((error) => {
  postMessage({
    type: 'ready',
    content: false,
  });
  console.error(error);
});