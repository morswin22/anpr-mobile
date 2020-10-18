const RECORDING_START_TIMEOUT = 250;
const ZOOM_MULT = 2 ** (1/2);
const RATIO = 128 / 64;
const SLIDE_STEP = 8 / 128;
const EVERY_N_FRAME = 5;
const captures = [];
let captureID;
let captureStart;
let recordStartTimeout;
let isRecording = false;
let stream = [];
let streamI;
let model;
let mapped;
let output = [];

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

const predict = () => {
  const start = Date.now();
  let last = start;
  let timesSum = 0;

  output = [];
  const divider = tf.scalar(255);
  const filteredStream = stream.filter((_, i) => !(i % EVERY_N_FRAME));

  for (const index in filteredStream) {
    const frame = filteredStream[index];
    let buffer = tf.tensor([]);
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
    width = floor(width)
    height = floor(height);

    let zoom = 1;
    const max_zoom = 2 ** (1/2);
    while (zoom <= max_zoom) {
      const scaled_w = floor(w * zoom), scaled_h = floor(h * zoom);

      const overflow_x = abs(width - scaled_w), overflow_y = abs(height - scaled_h);
      const coeff = w / scaled_w;

      const copied = frame.get();

      const step = floor(SLIDE_STEP * scaled_w);
      for (let i = 0; i <= overflow_x; i += step) {
        for (let j = 0; j <= overflow_y; j += step) {
          out.push([[floor(i * coeff), floor(j * coeff)], [floor(width * coeff), floor(height * coeff)]]);
          const sliced = copied.get(i, j, width, height);
          sliced.resize(128, 64);
          buffer = tf.tidy(() => buffer.concat(tf.browser.fromPixels(sliced.canvas).mean(2).toFloat().expandDims(-1).div(divider).reshape([1, 128, 64, 1])));
        }
      }
      zoom *= ZOOM_MULT;
    }

    const predictions = model.predict(buffer);
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

    buffer.dispose();
    predictions.dispose();

    const now = Date.now();
    timesSum += now - last;
    last = now;
    const next = Number(index) + 1;
    const took = floor((now - start) / 1000);
    const willTake = floor((timesSum / next) * (filteredStream.length - next) / 1000);
    console.log(`${nf(floor(next/filteredStream.length*100), 1, 0)}% | ${next}/${filteredStream.length} | [${nf(floor(took / 60), 2, 0)}:${nf(took % 60, 2, 0)}<${nf(floor(willTake / 60), 2, 0)}:${nf(willTake % 60, 2, 0)}, ${floor(timesSum / next)}ms/frame]`);
    console.log(`Found ${output[index].length}`);
  }
}

function setup() {
  const canvas = createCanvas(windowWidth, windowHeight);
  canvas.elt.addEventListener('click', () => {
    stream = [];
    output = [];
  });

  tf.loadLayersModel('/assets/anpr/model.json').then(m => model = m);
  fetch('/assets/anpr/map.json').then(response => response.json()).then(data => mapped = data);

  navigator.mediaDevices.enumerateDevices().then(deviceInfos => {
    let i = 0;
    for (const info of deviceInfos) {
      if (info.kind == 'videoinput') {
        const li = document.createElement('li');
        li.innerText = info.label;
        li.setAttribute('data-id', i);
        li.addEventListener('click', e => {
          captureID = parseInt(e.target.getAttribute('data-id'));
        });
        capturesList.appendChild(li);
        const capture = createCapture({
          video: info
        });
        capture.hide();
        captures.push(capture);
        i++;
      }
    }
    if (captures.length) captureID = 0;
  });

  const onTouchStart = () => {
    stream = [];
    output = [];
    captureStart = Date.now();
    recordStartTimeout = setTimeout(() => {
      isRecording = true;
      stream = [];
      output = [];
      streamI = 0;
    }, RECORDING_START_TIMEOUT);
  };
  const onTouchEnd = () => {
    isRecording = false;
    const stop = Date.now();
    const duration = stop - captureStart;
    if (duration <= RECORDING_START_TIMEOUT) {
      clearTimeout(recordStartTimeout);
      if (captureID !== undefined) {
        stream = [captures[captureID].get()];
        streamI = 0;
      }
    }
    predict();
  };
  captureButton.addEventListener('mousedown', onTouchStart);
  captureButton.addEventListener('touchstart', onTouchStart);
  captureButton.addEventListener('mouseup', onTouchEnd);
  captureButton.addEventListener('touchend', onTouchEnd);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function draw() {
  background(229);
  let canvas;

  if (captureID === undefined) return;
  if (stream.length && !isRecording) {
    canvas = stream[streamI]
    streamI += 1;
    if (streamI == stream.length) streamI = 0;
  } else {
    canvas = captures[captureID]
  }

  let width, height;
  if (canvas.width >= canvas.height) {
    width = windowWidth;
    height = width * canvas.height/canvas.width
    if (height > windowHeight) {
      height = windowHeight;
      width = height * canvas.width/canvas.height;
    }
  } else {
    height = windowHeight;
    width = height * canvas.width/canvas.height;
    if (width > windowWidth) {
      width = windowWidth;
      height = width * canvas.height/canvas.width;
    }
  }

  const offsetX = (windowWidth - width) / 2;
  const offsetY = (windowHeight - height) / 2;
  
  const snap = canvas.get();
  if (isRecording) stream.push(snap);
  image(snap, offsetX, offsetY, width, height);

  if (output.length > streamI) {
    const coeff = width / snap.width;
    const results = output[streamI];
    noFill();
    stroke(0, 255, 0);
    for (const result of results) {
      const [bbox, label] = result;
      const left = offsetX + bbox[0][0] * coeff;
      const top = offsetY + bbox[0][1] * coeff;
      const width = bbox[1][0] * coeff;
      const height = bbox[1][1] * coeff;
      text(label, left, top, width, height);
      rect(left, top, width, height);
    }
  }
}