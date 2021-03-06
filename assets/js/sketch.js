const clickTimeout = 250;
const captures = [];
let skipEvery;
let debug = false;
let drawFunction = drawLoading;
let captureID;
let captureStart;
let isRecording = false;
let stream = [];
let streamI = 0;
let output = [];
let worker;
let percentDownloaded = 0;
let timeLeft = 0;
let timeReceived = 0;
let status;
let lastAverage = 0;
let errorBubbles = [];
const maxErrorBubbles = 13;
const errorBubbleSizes = [20, 50];
const errorBubbleDurations = [120, 720];
const errorMessage = 'An error has occurred';
let fileInput;
let noCaptures = false;

const getWorker = path => {
  worker = new Worker(path);
  worker.onmessage = ({ data: { type, content } }) => {
    if (type === 'status') {
      status = content;
      status.received = Date.now();
      lastAverage = status.average / 1000;
      drawStatus();
      if (debug) {
        console.log(`${nf(status.percent, 1, 0)}% | ${status.done}/${status.toDo} | [${nf(status.took[0], 2, 0)}:${nf(status.took[1], 2, 0)}<${nf(status.willTake[0], 2, 0)}:${nf(status.willTake[1], 2, 0)}, ${status.average}ms/frame]`);
        console.log(`Found ${status.found}`);
      }
    } else if (type === 'result') {
      output = content.output;
      drawFunction = drawOutput;
    } else if (type === 'loading') {
      percentDownloaded = content.percentDownloaded;
      timeReceived = Date.now();
      timeLeft = floor(content.willFinishIn / 1000);
    } else if (type === 'ready') {
      if (content) {
        drawFunction = drawOutput;
        ui.removeAttribute('style');
      } else {
        drawFunction = drawError;
      }
    }
  }
}

const getDevices = () => {
  navigator.mediaDevices.enumerateDevices().then(deviceInfos => {
    let i = 0;
    let humanIndex = 1;
    for (const info of deviceInfos) {
      if (info.kind == 'videoinput') {
        const li = document.createElement('li');
        li.innerText = info.label.trim() || `Camera ${humanIndex++}`;
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
    if (captures.length) {
      captureID = 0;
    } else {
      noCaptures = true;
      const li = document.createElement('li');
      li.innerText = 'No video inputs detected'
      capturesList.appendChild(li);
    }
  });
}

const buttonPressStart = () => {
  stream = [];
  streamI = 0;
  output = [];
  captureStart = Date.now();
  isRecording = true;
  menu.setAttribute('style', 'display: none;');
}

const buttonPressEnd = () => {
  isRecording = false;
  const stop = Date.now();
  const duration = stop - captureStart;
  if (duration <= clickTimeout) {
    if (captureID !== undefined) {
      stream = [captures[captureID].get()];
      streamI = 0;
    }
  }

  skipEvery = parseInt(skipEveryInput.value);
  const pendingImageBitmaps = [];
  for (const frame of stream.filter((_, i) => !(i % skipEvery))) {
    pendingImageBitmaps.push(createImageBitmap(frame.canvas, 0, 0, frame.width, frame.height));
  }

  Promise.all(pendingImageBitmaps).then(imageBitmaps => {
    const willTake = floor(lastAverage * imageBitmaps.length);
    status = {
      percent: 0,
      done: 0,
      toDo: imageBitmaps.length,
      took: [0, 0],
      willTake: [floor(willTake / 60), willTake % 60],
      average: 0,
      found: 0,
      received: Date.now(),
    };
    drawStatus();
    drawFunction = drawStatus;
  
    worker.postMessage({
      type: 'arguments',
      content: {
        stream: imageBitmaps,
        slideStep: parseFloat(slideStepInput.value),
        maxZoomExp: parseInt(maxZoomExpInput.value),
      }
    });
  });
}

const canvasPress = () => {
  stream = [];
  output = [];
  menu.setAttribute('style', 'display: none;');
};

const menuToggle = () => {
  if (menu.getAttribute('style') && !isRecording) {
    menu.removeAttribute('style');
  } else {
    menu.setAttribute('style', 'display: none;');
  }
}

const showMenuItem = element => () => {
  [...menu.children].slice(1).forEach(child => child.setAttribute('style', 'display: none'));
  element.removeAttribute('style');
}

const updateParameterOutput = element => ({ target: { value } }) => element.innerText = value;

const openFileInputDialog = () => {
  menu.setAttribute('style', 'display: none;');
  fileInput.elt.click();
}

const parseFile = ({type, data}) => {
  if (type === 'image') {
    loadImage(data, image => {
      stream = [image];
      buttonPressEnd();
    });
  }
}

function setup() {
  const canvas = createCanvas(windowWidth, windowHeight);
  canvas.elt.addEventListener('click', canvasPress);

  fileInput = createFileInput(parseFile, false);
  fileInput.hide();
  fileInput.elt.setAttribute('accept', 'image/*');

  textFont('Helvetica');
  getWorker('/assets/js/worker.js');
  getDevices();

  captureButton.addEventListener('mousedown', buttonPressStart);
  captureButton.addEventListener('touchstart', buttonPressStart);
  captureButton.addEventListener('mouseup', buttonPressEnd);
  captureButton.addEventListener('touchend', buttonPressEnd);
  menuButton.addEventListener('click', menuToggle);
  showCapturesList.addEventListener('click', showMenuItem(capturesList));
  showParametersList.addEventListener('click', showMenuItem(parametersList));
  maxZoomExpInput.addEventListener('change', updateParameterOutput(maxZoomExpOutput));
  slideStepInput.addEventListener('change', updateParameterOutput(slideStepOutput));
  skipEveryInput.addEventListener('change', updateParameterOutput(skipEveryOutput));
  galleryButton.addEventListener('click', openFileInputDialog);
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
  const realtimeLeft = max(timeLeft - floor((Date.now() - timeReceived) / 1000), 0);
  if (realtimeLeft >= 60) timeText += `${floor(realtimeLeft / 60)}m `;
  timeText += `${realtimeLeft % 60}s left`;
  
  const smaller = min(windowWidth, windowHeight);
  
  stroke(250, 200, 35);
  strokeWeight(0.02*smaller);
  noFill();
  arc(windowWidth*0.5, windowHeight*0.5, smaller * 0.5, smaller * 0.5, -PI/2, -PI/2 + percentDownloaded*TAU);

  noStroke()
  fill(0);
  textSize(map(smaller, 200, 1000, 12, 28));
  textAlign(CENTER, CENTER);
  text("Loading\n"+timeText, windowWidth*0.5, windowHeight*0.5);
}

function drawError() {
  noStroke();
  const errorBubbleColor = color(220, 0, 0);
  for (let i = errorBubbles.length - 1; i >= 0; i--) {
    const [x, y, size, drawn, total] = errorBubbles[i];
    errorBubbleColor.setAlpha(255 * (-2 * abs((drawn/total) - 0.5) + 1));
    fill(errorBubbleColor);
    ellipse(x, y, size, size);
    if (drawn + 1 < total) {
      errorBubbles[i][3] += 1;
    } else {
      errorBubbles.splice(i, 1);
    }
  }
  if (errorBubbles.length < maxErrorBubbles && random() < 0.2) {
    errorBubbles.push([
      random(errorBubbleSizes[0], windowWidth-errorBubbleSizes[1]), 
      random(errorBubbleSizes[0], windowHeight-errorBubbleSizes[1]),
      random(errorBubbleSizes[0], errorBubbleSizes[1]),
      0,
      random(errorBubbleDurations[0], errorBubbleDurations[1]),
    ]);
  }

  for (i = 25; i > 9; i--) {
    textSize(i);
    if (textWidth(errorMessage) + 20 < windowWidth) break;
  }
  fill(0);
  text(errorMessage, windowWidth*0.5, windowHeight*0.5);
}

function drawStatus() {
  const past = (Date.now() - status.received) / 1000;
  const tookSeconds = status.took[1] + Math.floor(past) % 60;
  const tookMinutes = status.took[0] + Math.floor((status.took[1] + past) / 60);
  const smaller = min(windowWidth, windowHeight);
  
  stroke(250, 200, 35);
  strokeWeight(0.02*smaller);
  noFill();
  arc(windowWidth*0.5, windowHeight*0.5, smaller * 0.5, smaller * 0.5, -PI/2, -PI/2 + ((status.done + lastAverage !== 0 ? min(past / lastAverage, 1) : 0)/status.toDo)*TAU);

  noStroke()
  fill(0);
  textSize(map(smaller, 200, 1000, 12, 28));
  textAlign(CENTER, CENTER);
  text(`${status.done}/${status.toDo}\n${nf(tookMinutes, 2, 0)}:${nf(tookSeconds, 2, 0)} < ${nf(status.willTake[0], 2, 0)}:${nf(status.willTake[1], 2, 0)}`, windowWidth*0.5, windowHeight*0.5);
}

function drawOutput() {
  let canvas;

  if (captureID === undefined && noCaptures === false) return;
  if (stream.length && !isRecording) {
    canvas = stream[streamI];
    streamI += 1;
    if (streamI == stream.length) streamI = 0;
  } else {
    canvas = captures[captureID]
  }
  if (canvas === undefined) return;

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
    strokeWeight(2);
    for (const result of results) {
      const bbox = result[0];
      const left = offsetX + bbox[0][0] * coeff;
      const top = offsetY + bbox[0][1] * coeff;
      const width = bbox[1][0] * coeff;
      const height = bbox[1][1] * coeff;
      if (result[3] === undefined) {
        let broke = false;
        let fontSize;
        for (fontSize = 32; fontSize >= 14; fontSize -= 2) {
          textSize(fontSize);
          if (textWidth(result[1]) < width) {
            broke = true;
            break;
          }
        }
        result[2] = fontSize;
        if (!broke) {
          let labelLength;
          for (let i = 1; i < result[1].length; i++) {
            if (textWidth(result[1].slice(0, i) + '…') < width) {
              labelLength = i;
            } else {
              break;
            }
          }
          result[1] = result[1].slice(0, labelLength) + '…';
        }
      }
      const [, label, fontSize] = result;
      if (label) {
        noStroke();
        fill(0, 255, 0);
        textSize(fontSize);
        textAlign(LEFT, TOP);
        text(label, left, top);
      } 
      noFill();
      stroke(0, 255, 0);
      rect(left, top, width, height);
    }
  }
}