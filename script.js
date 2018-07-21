var image       = null;
var imageWidth  = 0;
var imageHeight = 0;
var sourceImage = []; /* array of [R, G, B] */
var seedImage   = []; /* array of 0 (bg), 1 (fg) or undefined */

var penMode = undefined;
var cutMode = false;

function onChangePath (e) {
    var reader = new FileReader();
    reader.onload = function (e) {
        image = document.createElement("img");

        image.onload = function () {
            var tmpCanvas = document.createElement("canvas");
            tmpCanvas.width  = imageWidth  = image.naturalWidth;
            tmpCanvas.height = imageHeight = image.naturalHeight;

            var ctx = tmpCanvas.getContext('2d');
            ctx.drawImage(image, 0, 0);

            sourceImage = [];
            seedImage = [];
            var imageData = ctx.getImageData(0, 0, imageWidth, imageHeight).data;
            for (var x = 0; x < imageWidth; x++) {
                for (var y = 0; y < imageHeight; y++) {
                    var ix = y * imageWidth + x;
                    var data = [imageData[ix * 4], imageData[ix * 4 + 1], imageData[ix * 4 + 2]];
                    sourceImage[ix] = data;
                }
            }

            var canvas = document.getElementById("canvas");
            canvas.width  = imageWidth;
            canvas.height = imageHeight;
            canvas.style.backgroundImage = "url(" + e.target.result + ")";
            canvas.style.backgroundSize  = "contain";
        };

        image.src = e.target.result;
    };
    reader.readAsDataURL(e.target.files[0]);
}

var mouseDownPos = [];

function getImagePos (e, canvas /* optional */) {
    canvas = canvas || e.target;
    var scale = canvas.width / canvas.offsetWidth;
    var rect = canvas.getBoundingClientRect();
    var imgX = Math.floor((e.clientX - rect.left) * scale);
    var imgY = Math.floor((e.clientY - rect.top) * scale);
    return { x: imgX, y: imgY, scale: scale };
}

function onMouseMoveCanvas (e) {
    if (penMode < 2 && mouseDownPos) {
        var pos = getImagePos(e);
        var ctx = e.target.getContext('2d');
        ctx.fillStyle = penMode == 0 ? "#ff0000" : "#0000ff";
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 3 * pos.scale, 0, 2 * Math.PI);
        ctx.fill();

        seedImage[pos.y * imageWidth + pos.x] = penMode;
    }
}

function onMouseDownCanvas (e) {
    mouseDownPos = getImagePos(e);
    e.preventDefault(e);
}

function onMouseUpCanvas (e) {
    if (mouseDownPos) {
        if (penMode < 2) {
            onMouseMoveCanvas(e);
        } else if (cutMode) {
            var ctx = e.target.getContext('2d');
            ctx.fillStyle = "#ff0000";

            var mouseUpPos = getImagePos(e, document.getElementById("canvas"));
            var vec  = { x: mouseUpPos.x - mouseDownPos.x, y: mouseUpPos.y - mouseDownPos.y };
            for (var x = 0; x < imageWidth; x++) {
                for (var y = 0; y < imageHeight; y++) {
                    var vec2 = { x: x - mouseDownPos.x, y: y - mouseDownPos.y };
                    if (vec.x * vec2.y - vec2.x * vec.y < 0) {
                        seedImage[y * imageWidth + x] = 0;
                        ctx.fillRect(x, y, 1, 1);
                    }
                }
            }
        }
        mouseDownPos = null;
    }
}

function render () {
    Growcut.initialize(imageWidth, imageHeight, sourceImage, seedImage);

    do {
        var updated = Growcut.forwardGeneration();
        console.log(updated);
    } while (updated);

    var res = Growcut.getResult();
    var blurRadius = Math.floor(Math.min(imageWidth, imageHeight) / 250);
    var blurred = [];
    for (var x = 0; x < imageWidth; x++) {
        for (var y = 0; y < imageWidth; y++) {
            var sum   = 0;
            var count = 0;
            for (var dx = - blurRadius; dx <= blurRadius; dx++) {
                for (var dy = - blurRadius; dy <= blurRadius; dy++) {
                    if (0 < x + dx && x + dx < imageWidth && 0 < y + dy && y + dy < imageHeight) {
                        sum += res[(y + dy) * imageWidth + (x + dx)] * 255;
                        count++;
                    }
                }
            }
            blurred[y * imageWidth + x] = sum / count;
        }
    }

    var canvas = document.getElementById("res");
    canvas.width  = imageWidth;
    canvas.height = imageHeight;

    var ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0);

    var imageData = ctx.getImageData(0, 0, imageWidth, imageHeight);
    for (var x = 0; x < imageWidth; x++) {
        for (var y = 0; y < imageHeight; y++) {
            var ix = y * imageWidth + x;
            imageData.data[ix * 4 + 3] = blurred[ix];
        }
    }
    ctx.putImageData(imageData, 0, 0);
}

document.getElementById("file").onchange = onChangePath;
document.getElementById("canvas").addEventListener("mousedown", onMouseDownCanvas);
document.getElementById("canvas").addEventListener("mousemove", onMouseMoveCanvas);
document.getElementById("canvas").addEventListener("mouseup", onMouseUpCanvas);
document.getElementById("canvas").addEventListener("mouseout", onMouseUpCanvas);
document.getElementById("render").onclick = render;
document.getElementById("bg-cut").onclick = function () { penMode = undefined; cutMode = true; };
document.getElementById("bg").onclick = function () { penMode = 0; cutMode = false; };
document.getElementById("fg").onclick = function () { penMode = 1; cutMode = false; };
