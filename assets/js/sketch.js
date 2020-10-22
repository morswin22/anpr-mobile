const clickTimeout = 250;
const skipEvery = 5;
const captures = [];
let drawFunction = drawLoading;
let captureID;
let captureStart;
let isRecording = false;
let stream = [];
let streamI;
let output = [];
let worker;
let percentDownloaded = 0;
let timeLeft = 0;

const getWorker = path => {
  worker = new Worker(path);
  worker.onmessage = ({ data: { type, content } }) => {
    if (type === 'status') {
      // TODO Add status display
      console.log(`${nf(content.percent, 1, 0)}% | ${content.done}/${content.toDo} | [${nf(content.took[0], 2, 0)}:${nf(content.took[1], 2, 0)}<${nf(content.willTake[0], 2, 0)}:${nf(content.willTake[1], 2, 0)}, ${content.average}ms/frame]`);
      console.log(`Found ${content.found}`);
    } else if (type === 'result') {
      output = content.output;
    } else if (type === 'loading') {
      percentDownloaded = content.percentDownloaded;
      timeLeft = floor(content.willFinishIn / 1000);
    } else if (type === 'ready') {
      if (content) {
        drawFunction = drawOutput;
        captureButton.removeAttribute('style');
      } else {
        drawFunction = drawError;
      }
    }
  }
}

const getDevices = () => {
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
}

const buttonPressStart = () => {
  stream = [];
  streamI = 0;
  output = [];
  captureStart = Date.now();
  isRecording = true;
}

const buttonPressEnd = async () => {
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
}

const canvasPress = () => {
  stream = [];
  output = [];
}

function setup() {
  const canvas = createCanvas(windowWidth, windowHeight);
  canvas.elt.addEventListener('click', canvasPress);

  getWorker('/assets/js/worker.js');
  getDevices();

  captureButton.addEventListener('mousedown', buttonPressStart);
  captureButton.addEventListener('touchstart', buttonPressStart);
  captureButton.addEventListener('mouseup', buttonPressEnd);
  captureButton.addEventListener('touchend', buttonPressEnd);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function draw() {
  background(229);
  drawFunction();
}

function drawLoading() {
  let timeText = '';
  if (timeLeft >= 60) timeText += `${floor(timeLeft / 60)}m `;
  timeText += `${timeLeft % 60}s left`;
  
  const smaller = min(windowWidth, windowHeight);
  
  stroke(250, 200, 35);
  strokeWeight(0.02*smaller);
  noFill();
  arc(windowWidth*0.5, windowHeight*0.5, smaller * 0.5, smaller * 0.5, -PI/2, -PI/2 + percentDownloaded*TAU);

  noStroke()
  fill(0);
  textFont('Helvetica');
  textSize(map(smaller, 200, 1000, 12, 28));
  textAlign(CENTER, CENTER);
  text("Loading\n"+timeText, windowWidth*0.5, windowHeight*0.5);
}

function drawError() {
  // TODO Add error display
}

function drawOutput() {
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