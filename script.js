var image       = null;
var sourceImage = []; /* array of [R, G, B] */
var seedImage   = []; /* array of 0 (bg), 1 (fg) or undefined */

var penMode = undefined; /* 0, 1 or undefined */
var cutMode = false;

var worker;

function onChangePath (e) {
    var reader = new FileReader();
    reader.onload = function (e) {
        image = document.createElement("img");

        image.onload = function () {
            var tmpCanvas = document.createElement("canvas");
            tmpCanvas.width  = image.naturalWidth;
            tmpCanvas.height = image.naturalHeight;

            var ctx = tmpCanvas.getContext('2d');
            ctx.drawImage(image, 0, 0);

            sourceImage = [];
            seedImage = [];
            var imageData = ctx.getImageData(0, 0, image.naturalWidth, image.naturalHeight).data;
            for (var x = 0; x < image.naturalWidth; x++) {
                for (var y = 0; y < image.naturalHeight; y++) {
                    var ix = y * image.naturalWidth + x;
                    var data = [imageData[ix * 4], imageData[ix * 4 + 1], imageData[ix * 4 + 2]];
                    sourceImage[ix] = data;
                }
            }

            var canvas = document.getElementById("canvas");
            canvas.width  = image.naturalWidth;
            canvas.height = image.naturalHeight;
            canvas.style.backgroundImage = "url(" + e.target.result + ")";
            canvas.style.backgroundSize  = "contain";

            worker.postMessage({
                method: "loadImage",
                width: image.naturalWidth,
                height: image.naturalHeight,
                sourceImage: sourceImage
            });
            document.getElementById("status").innerHTML = "初期化中 ...";
        };

        image.src = e.target.result;
        document.getElementById("status").innerHTML = "ファイルを開いています ...";
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

        seedImage[pos.y * image.naturalWidth + pos.x] = penMode;
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
            for (var x = 0; x < image.naturalWidth; x++) {
                for (var y = 0; y < image.naturalHeight; y++) {
                    var vec2 = { x: x - mouseDownPos.x, y: y - mouseDownPos.y };
                    if (vec.x * vec2.y - vec2.x * vec.y < 0) {
                        seedImage[y * image.naturalWidth + x] = 0;
                        ctx.fillRect(x, y, 1, 1);
                    }
                }
            }
        }
        mouseDownPos = null;
    }
}

function _renderResult (res) {
    var canvas = document.getElementById("res");
    canvas.width  = image.naturalWidth;
    canvas.height = image.naturalHeight;

    var ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0);

    var imageData = ctx.getImageData(0, 0, image.naturalWidth, image.naturalHeight);
    for (var x = 0; x < image.naturalWidth; x++) {
        for (var y = 0; y < image.naturalHeight; y++) {
            var ix = y * image.naturalWidth + x;
            imageData.data[ix * 4 + 3] = Math.floor(res[ix] * 255);
        }
    }
    ctx.putImageData(imageData, 0, 0);
}

function run () {
    document.getElementById("run").disabled = true;

    var generation = 2;
    var listener = function (e) {
        switch (e.data.method) {
            case "initialize-complete":
                document.getElementById("status").innerHTML = "Growcut-ing (第1世代)...";
                worker.postMessage({ method: "forwardGeneration" });
                break;
            case "forwardGeneration-complete":
                if (e.data.updated) {
                    document.getElementById("status").innerHTML = "Growcut-ing (第" + (generation++) + "世代: " + e.data.updated +  ") ...";
                    worker.postMessage({ method: "forwardGeneration" });
                } else {
                    var blurRadius = Math.floor(Math.min(image.naturalWidth, image.naturalHeight) / 500);
                    document.getElementById("status").innerHTML = "境界をぼかしています ...";
                    worker.postMessage({ method: "getBlurredResult", radius: blurRadius });
                }
                break;
            case "getBlurredResult-complete":
                document.getElementById("status").innerHTML = "";
                document.getElementById("run").disabled = false;
                worker.removeEventListener('message', listener);
                _renderResult(e.data.result);
                break;
        }
    };
    worker.addEventListener('message', listener);

    document.getElementById("status").innerHTML = "Growcut を開始中 ...";
    worker.postMessage({ method: "initialize", seedImage: seedImage })
}

try {
    worker = new Worker("growcut.js");
} catch (e) {
    /* Executing local script file may fail. Try with a blobURL that case.
       http://d.hatena.ne.jp/tshino/20180106/1515218776 */
    var dir  = window.location.href.replace(/\\/g, '/').replace(/\/[^\/]*$/, '/');
    var blob = new Blob(['importScripts("' + dir + 'growcut.js");'], {type: 'text/javascript'});
    worker = new Worker(window.URL.createObjectURL(blob));
}

worker.addEventListener('message', function (e) {
    switch (e.data.method) {
        case "loadImage-complete":
            document.getElementById("status").innerHTML = "";
            document.getElementById("run").disabled = false;
            break;
    }
});

document.getElementById("file").onchange = onChangePath;
document.getElementById("canvas").addEventListener("mousedown", onMouseDownCanvas);
document.getElementById("canvas").addEventListener("mousemove", onMouseMoveCanvas);
document.getElementById("canvas").addEventListener("mouseup", onMouseUpCanvas);
document.getElementById("canvas").addEventListener("mouseout", onMouseUpCanvas);
document.getElementById("run").onclick = run;
document.getElementById("bg-cut").onclick = function () { penMode = undefined; cutMode = true; };
document.getElementById("bg").onclick = function () { penMode = 0; cutMode = false; };
document.getElementById("fg").onclick = function () { penMode = 1; cutMode = false; };
