importScripts('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@2.6.0/dist/tf.min.js');

(async () => {
  const ZOOM_MULT = 2 ** (1/2);
  const RATIO = 128 / 64;

  const model = await tf.loadLayersModel('/assets/anpr/model.json');
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
      // TODO Add output processing
      output.push(out.filter(bbox => bbox));

      for (const tensor of buffer) {
        tensor.dispose();
      }
      predictions.dispose();

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

})();