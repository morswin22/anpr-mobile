let capture;

function setup() {
  createCanvas(windowWidth, windowHeight);
  capture = createCapture(VIDEO);
  capture.hide();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function draw() {
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