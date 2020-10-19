const clickTimeout = 250;
const skipEvery = 5;
const captures = [];
let captureID;
let captureStart;
let isRecording = false;
let stream = [];
let streamI;
let output = [];
let worker;

function setup() {
  const canvas = createCanvas(windowWidth, windowHeight);
  canvas.elt.addEventListener('click', () => {
    stream = [];
    output = [];
  });

  worker = new Worker('/assets/js/worker.js');
  worker.onmessage = ({ data: { type, content } }) => {
    if (type === 'status') {
      console.log(`${nf(content.percent, 1, 0)}% | ${content.done}/${content.toDo} | [${nf(content.took[0], 2, 0)}:${nf(content.took[1], 2, 0)}<${nf(content.willTake[0], 2, 0)}:${nf(content.willTake[1], 2, 0)}, ${content.average}ms/frame]`);
      console.log(`Found ${content.found}`);
    } else if (type === 'result') {
      output = content.output;
    } else if (type === 'ready') {
      console.log(content ? 'Worker is ready' : 'Worker is not ready');
    }
  }

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
    streamI = 0;
    output = [];
    captureStart = Date.now();
    isRecording = true;
  };

  const onTouchEnd = async () => {
    isRecording = false;
    const stop = Date.now();
    const duration = stop - captureStart;
    if (duration <= clickTimeout) {
      if (captureID !== undefined) {
        stream = [captures[captureID].get()];
        streamI = 0;
      }
    }

    const imageBitmaps = [];
    for (const frame of stream.filter((_, i) => !(i % skipEvery))) {
      imageBitmaps.push(await createImageBitmap(frame.canvas, 0, 0, frame.width, frame.height));
    }

    worker.postMessage({
      type: 'arguments',
      content: {
        stream: imageBitmaps,
        slideStep: 8,
        maxZoomExp: 1,
      }
    });
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

  if (output.length*skipEvery > streamI) {
    const coeff = width / snap.width;
    const results = output[floor(streamI/skipEvery)];
    noFill();
    stroke(0, 255, 0);
    for (const result of results) {
      const [bbox, label, fontSize] = result;
      const left = offsetX + bbox[0][0] * coeff;
      const top = offsetY + bbox[0][1] * coeff;
      const width = bbox[1][0] * coeff;
      const height = bbox[1][1] * coeff;
      if (label) text(label, left, top, width, height);
      rect(left, top, width, height);
    }
  }
}