const RECORDING_START_TIMEOUT = 250;
const captures = [];
let captureID;
let captureStart;
let recordStartTimeout;
let isRecording = false;
let stream = [];
let streamI;

function setup() {
  const canvas = createCanvas(windowWidth, windowHeight);
  canvas.elt.addEventListener('click', () => {
    stream = [];
  });

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
    photo = undefined;
    captureStart = Date.now();
    recordStartTimeout = setTimeout(() => {
      isRecording = true;
      stream = [];
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
  
  const snap = canvas.get();
  if (isRecording) stream.push(snap);
  image(snap, (windowWidth - width) / 2, (windowHeight - height) / 2, width, height);
}