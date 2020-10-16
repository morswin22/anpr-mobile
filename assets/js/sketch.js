const captures = [];
let captureID;

function setup() {
  createCanvas(windowWidth, windowHeight);

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

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function draw() {
  if (captureID === undefined) return;
  const capture = captures[captureID]

  background(229);

  let width, height;
  if (capture.width >= capture.height) {
    width = windowWidth;
    height = width * capture.height/capture.width
    if (height > windowHeight) {
      height = windowHeight;
      width = height * capture.width/capture.height;
    }
  } else {
    height = windowHeight;
    width = height * capture.width/capture.height;
    if (width > windowWidth) {
      width = windowWidth;
      height = width * capture.height/capture.width;
    }
  }
  
  image(capture, (windowWidth - width) / 2, (windowHeight - height) / 2, width, height);
}