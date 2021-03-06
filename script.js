/* ---- Update button state and statusline */

function onLoadImageStart () {
    document.getElementById("status").innerHTML = "ファイルを開いています ...";
    document.getElementById("file").disabled = true;
    document.getElementById("run").disabled = true;
    document.getElementById("restore").disabled = true;
    document.getElementsByClassName("controls").forEach(function (x) { x.disabled = true; });
}

function onInitializeStart () {
    document.getElementById("status").innerHTML = "初期化中 ...";
    document.getElementsByClassName("controls").forEach(function (x) { x.disabled = false; });
}

function onInitializeEnd () {
    document.getElementById("status").innerHTML = "";
    document.getElementById("file").disabled = false;
    document.getElementById("run").disabled = false;
}

function onGrowcutSeed () {
    document.getElementById("status").innerHTML = "Growcut を開始中 ...";
    document.getElementById("file").disabled = true;
    document.getElementById("run").disabled = true;
    document.getElementById("restore").disabled = true;
    document.getElementsByClassName("controls").forEach(function (x) { x.disabled = true; });
}

var generation;

function onGrowcutStart () {
    document.getElementById("status").innerHTML = "Growcut-ing (第1世代) ...";
    generation = 2;
}

function onGrowcutProgress (updatedCells) {
    document.getElementById("status").innerHTML =
        "Growcut-ing (第" + (generation++) + "世代: 対象ピクセル " + updatedCells + ") ...";
}

function onBlurStart () {
    document.getElementById("status").innerHTML = "境界をぼかしています ...";
}

function onBlurEnd () {
    document.getElementById("status").innerHTML = "";
    document.getElementById("file").disabled = false;
    document.getElementById("run").disabled = false;
    document.getElementsByClassName("controls").forEach(function (x) { x.disabled = false; });
}

function onBackupCreated () {
    document.getElementById("restore").disabled = false;
}

function onBackupRestored () {
    document.getElementById("restore").disabled = true;
}

/* ---- Utils */

/* "forEach" over a collection of DOMs */
HTMLCollection.prototype.forEach = function (fn) {
    for (var i = 0; i < this.length; i++) fn(this.item(i));
};

/* Convert image into an Uint8Array object. */
function imageData (image) {
    var tmpCanvas = document.createElement("canvas");
    tmpCanvas.width  = image.naturalWidth;
    tmpCanvas.height = image.naturalHeight;

    var ctx = tmpCanvas.getContext('2d');
    ctx.drawImage(image, 0, 0);

    var data = ctx.getImageData(0, 0, image.naturalWidth, image.naturalHeight).data;
    tmpCanvas.remove();

    return data;
}

/* Get event's position in the canvas image. If the event.target is
   not the canvas, you may pass the canvas as the second optional
   argument. */
function getImagePos (e, canvas /* default: e.target */) {
    canvas = canvas || e.target;
    var scale = canvas.width / canvas.offsetWidth;
    var rect = canvas.getBoundingClientRect();
    var imgX = Math.floor((e.clientX - rect.left) * scale);
    var imgY = Math.floor((e.clientY - rect.top) * scale);
    return { x: imgX, y: imgY, scale: scale };
}

/* Get the time string of this branch's last commit. */
function getUpdatedDatetime (handler) {
    var xhr = new XMLHttpRequest();
    xhr.responseType = "json";
    xhr.onload = function () {
        var jstDate = (new Date(this.response.commit.commit.author.date)).toLocaleString();
        handler(jstDate);
    };
    xhr.open("GET", "https://api.github.com/repos/zk-phi/kusocolla-republic/branches/gh-pages");
    xhr.send();
}

/* ---- Core */

var sourceImage = null; /* array of [R, G, B, A, R, G, B, A, ...] */
var image       = null; /* HTML img object of sourceImage */
var seedImage   = null; /* array of 0 (undefined), 1 (bg) or 2 (fg) */

var worker;

/* Load an image from given file into image / sourceImage, and
   initialize seedImage. */
function onChangePath (e) {
    var reader = new FileReader();
    reader.onload = function (e) {
        if (image) image.remove(); /* delete old image object */
        image = document.createElement("img");

        image.onload = function () {
            sourceImage = imageData(image);
            seedImage   = new Uint8Array(image.naturalWidth * image.naturalHeight);

            var canvas = document.getElementById("canvas");
            canvas.width  = image.naturalWidth;
            canvas.height = image.naturalHeight;
            canvas.style.backgroundImage = "url(" + e.target.result + ")";
            canvas.style.backgroundSize  = "contain";

            onInitializeStart();
            worker.postMessage({
                method: "loadImage",
                width: image.naturalWidth,
                height: image.naturalHeight,
                sourceImage: sourceImage
            });
        };

        image.src = e.target.result;
    };
    onLoadImageStart();
    reader.readAsDataURL(e.target.files[0]);
}

/* ---- */

var BG_PEN_COLOR = "#ff0000";
var FG_PEN_COLOR = "#0000ff";

var penMode = 0; /* 0, 1 or 2 */
var cutMode = false;
var mouseDownPos = null;

var canvasBackup = null;
var seedBackup = null;

function onMouseMoveCanvas (e) {
    if (penMode && mouseDownPos) {
        var pos = getImagePos(e);
        var ctx = e.target.getContext('2d');
        ctx.fillStyle = penMode == 1 ? BG_PEN_COLOR : FG_PEN_COLOR;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 3 * pos.scale, 0, 2 * Math.PI);
        ctx.fill();

        seedImage[pos.y * image.naturalWidth + pos.x] = penMode;
    }
}

function onMouseDownCanvas (e) {
    if (penMode || cutMode) {
        canvasBackup = e.target.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
        seedBackup = seedImage.copyWithin();
        onBackupCreated();
        mouseDownPos = getImagePos(e);
        e.preventDefault(e);
    }
}

function onMouseUpCanvas (e) {
    if (mouseDownPos) {
        if (penMode) {
            onMouseMoveCanvas(e);
        } else if (cutMode) {
            var ctx = e.target.getContext('2d');
            ctx.fillStyle = BG_PEN_COLOR;

            var mouseUpPos = getImagePos(e, document.getElementById("canvas"));
            var vec  = { x: mouseUpPos.x - mouseDownPos.x, y: mouseUpPos.y - mouseDownPos.y };
            for (var x = 0; x < image.naturalWidth; x++) {
                for (var y = 0, ix = x; y < image.naturalHeight; y++, ix += image.naturalWidth) {
                    var vec2 = { x: x - mouseDownPos.x, y: y - mouseDownPos.y };
                    if (vec.x * vec2.y - vec2.x * vec.y < 0) {
                        seedImage[ix] = 1;
                        ctx.fillRect(x, y, 1, 1);
                    }
                }
            }
        }
        mouseDownPos = null;
    }
}

function restoreCanvas () {
    var canvas = document.getElementById("canvas");
    canvas.getContext('2d').putImageData(canvasBackup, 0, 0);
    seedImage = seedBackup;
    onBackupRestored();
}

/* ---- */

function run () {
    penMode      = 0;
    cutMode      = false;
    mouseDownPos = [];
    onGrowcutSeed();
    worker.postMessage({ method: "initialize", seedImage: seedImage });
}

function _renderResult (res) {
    var canvas = document.getElementById("res");
    canvas.width  = image.naturalWidth;
    canvas.height = image.naturalHeight;

    var ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0);

    var imageData = ctx.getImageData(0, 0, image.naturalWidth, image.naturalHeight);
    for (var x = 0; x < image.naturalWidth; x++) {
        for (var y = 0, ix = x; y < image.naturalHeight; y++, ix += image.naturalWidth) {
            imageData.data[ix * 4 + 3] = res.data[ix];
        }
    }

    canvas.width  = res.width;
    canvas.height = res.height;
    ctx.putImageData(imageData, - res.left, - res.top);
}

/* ---- */

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
            onInitializeEnd();
            break;
        case "initialize-complete":
            onGrowcutStart();
            worker.postMessage({ method: "forwardGeneration" });
            break;
        case "forwardGeneration-complete":
            if (e.data.updated) {
                onGrowcutProgress(e.data.updated);
                worker.postMessage({ method: "forwardGeneration" });
            } else {
                var blurRadius = Math.floor(Math.min(image.naturalWidth, image.naturalHeight) / 500);
                onBlurStart();
                worker.postMessage({ method: "blurResult", radius: blurRadius });
            }
            break;
        case "blurResult-complete":
            worker.postMessage({ method: "getResult" });
            break;
        case "getResult-complete":
            onBlurEnd();
            _renderResult(e.data.result);
            break;
    }
});

/* ---- */

getUpdatedDatetime(function (datetime) {  document.getElementById("lastUpdated").innerHTML = datetime; });
document.getElementById("file").onclick = function () { document.getElementById("fileInput").click(); };
document.getElementById("fileInput").onchange = onChangePath;
document.getElementById("canvas").addEventListener("mousedown", onMouseDownCanvas);
document.getElementById("canvas").addEventListener("mousemove", onMouseMoveCanvas);
document.getElementById("canvas").addEventListener("mouseup", onMouseUpCanvas);
document.getElementById("canvas").addEventListener("mouseout", onMouseUpCanvas);
document.getElementById("restore").onclick = restoreCanvas;
document.getElementById("run").onclick = run;
document.getElementById("bg-cut").onclick = function () { penMode = 0; cutMode = true; };
document.getElementById("bg").onclick = function () { penMode = 1; cutMode = false; };
document.getElementById("fg").onclick = function () { penMode = 2; cutMode = false; };
