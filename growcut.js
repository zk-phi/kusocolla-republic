/* A simple growcut segmenter written in js / zk_phi */

var SQRT3 = Math.sqrt(3);

/* ---- DistanceMap */

function DistanceMap (width, height) {
    this._width = width;
    this._array = new Float64Array(width * height * 9);
}

DistanceMap.prototype.get = function (index, dx, dy) {
    return this._array[index * 9 + 4 + dy * 3 + dx];
};

DistanceMap.prototype.set = function (index, dx, dy, value) {
    var index2 = index + dy * this._width + dx;
    this._array[index * 9 + 4 + dy * 3 + dx] = this._array[index2 * 9 + 4 - dy * 3 - dx] = value;
};

/* ---- UintQueue */

function UintQueue (maxSize) {
    this.length      = 0;
    this._maxSize    = maxSize;
    this._pushPtr    = 0;
    this._unshiftPtr = 0;
    this._array      = new Uint16Array(maxSize); /* NOTE: image width must be less than 65536 */
}

UintQueue.prototype.unshift = function () {
    var val = this._array[this._unshiftPtr];
    this._unshiftPtr = (this._unshiftPtr + 1) % this._maxSize;
    this.length--;

    return val;
};

UintQueue.prototype.push = function (value) {
    this._array[this._pushPtr] = value;
    this._pushPtr = (this._pushPtr + 1) % this._maxSize;
    this.length++;
};

/* ---- the Growcut engine */

var Growcut = {
    /* fields */
    width:         0,    /* width in pixels */
    height:        0,    /* height in pixels */
    alphaMap:      null, /* (width * height) array of 0 (bg) to 255 (fg) */
    distanceMap:   null, /* (width * height)*9 array of the similarity of each adjacent colors (0.0 - 1.0) */
    reliablityMap: null, /* (width * height) array of the reliablity of each labels (0.0 - 1.0) */
    updatedCells:  null, /* queue of recently updated cells' X, Y, X, Y, ... (for optimization) */

    /* Initialize the growcut engine. */
    loadImage: function (width, height, sourceImage) {
        this.width  = width;
        this.height = height;

        this.distanceMap = new DistanceMap(width, height);

        var _setDistanceOfTwoCells = function (ix, dx, dy) {
            var ix2 = ix + dy * width + dx;

            var distance = ix == ix2 ? 0 : Math.sqrt(
                Math.pow(sourceImage[ix * 4 + 0] - sourceImage[ix2 * 4 + 0], 2)
                + Math.pow(sourceImage[ix * 4 + 1] - sourceImage[ix2 * 4 + 1], 2)
                + Math.pow(sourceImage[ix * 4 + 2] - sourceImage[ix2 * 4 + 2], 2)
            ) / 255 / SQRT3;

            this.distanceMap.set(ix, dx, dy, 1.0 - distance);
        }.bind(this);

        for (var x = 0; x < width; x++) {
            for (var y = 0, ix = x; y < height; y++, ix += width) {
                /*     x - 1        x        x + 1
                   +------------+--------+------------+
                   | -          | -      | -          | y - 1
                   +------------+--------+------------+
                   | -          | ix     | ix + 1     | y
                   +------------+--------+------------+
                   | ix + w - 1 | ix + w | ix + w + 1 | y + 1
                   +------------+--------+------------+
                 */
                _setDistanceOfTwoCells(ix, 0, 0);
                if (x + 1 < width) _setDistanceOfTwoCells(ix, 1, 0);
                if (y + 1 < height) {
                    _setDistanceOfTwoCells(ix, 0, 1);
                    if (x > 0) _setDistanceOfTwoCells(ix, -1, 1);
                    if (x + 1 < width) _setDistanceOfTwoCells(ix, 1, 1);
                }
            }
        }
    },

    initialize: function (seedImage) {
        this.alphaMap      = new Uint8Array(this.width * this.height);
        this.reliablityMap = new Float64Array(this.width * this.height);
        this.updatedCells  = new UintQueue(this.width * this.height * 2);
        for (var x = 0; x < this.width; x++) {
            for (var y = 0, ix = x; y < this.height; y++, ix += this.width) {
                this.alphaMap[ix] = seedImage[ix] == 1 ? 0 : 255;
                this.reliablityMap[ix] = seedImage[ix] ? 1 : 0
                if (this.reliablityMap[ix]) {
                    this.updatedCells.push(x);
                    this.updatedCells.push(y);
                }
            }
        }
    },

    /* Compute a step forward. */
    forwardGeneration: function () {
        var updated = 0;

        var targetCells = new UintQueue(this.updatedCells.length * 9);
        while (this.updatedCells.length) {
            var x = this.updatedCells.unshift();
            var y = this.updatedCells.unshift();
            [-1, 0, 1].forEach(function (dx) {
                [-1, 0, 1].forEach(function (dy) {
                    if (0 <= x + dx && x + dx < this.width && 0 <= y + dy && y + dy < this.height) {
                        targetCells.push(x + dx);
                        targetCells.push(y + dy);
                    }
                }.bind(this));
            }.bind(this));
        }

        while (targetCells.length) {
            var x = targetCells.unshift();
            var y = targetCells.unshift();
            var ix = y * this.width + x;

            var adjacentCells = [];
            [-1, 0, 1].forEach(function (dx) {
                [-1, 0, 1].forEach(function (dy) {
                    if (0 <= x + dx && x + dx < this.width && 0 <= y + dy && y + dy < this.height) {
                        var ix2 = (y + dy) * this.width + (x + dx);
                        adjacentCells.push({
                            alpha: this.alphaMap[ix2],
                            rel:   this.reliablityMap[ix2] * this.distanceMap.get(ix, dx, dy)
                        });
                    }
                }.bind(this));
            }.bind(this));

            var next = adjacentCells.reduce(function (x, y) { return x.rel < y.rel ? y : x; });
            if (this.alphaMap[ix] != next.alpha || this.reliablityMap[ix] != next.rel) {
                updated++;
                this.updatedCells.push(x);
                this.updatedCells.push(y);
            }
            this.reliablityMap[ix] = next.rel;
            this.alphaMap[ix]      = next.alpha;
        }

        return updated;
    },

    blurResult: function (radius) {
        var blurred = [];
        for (var x = 0; x < this.width; x++) {
            for (var y = 0; y < this.height; y++) {
                var sum   = 0;
                var count = 0;
                for (var dx = - radius; dx <= radius; dx++) {
                    for (var dy = - radius; dy <= radius; dy++) {
                        if (0 <= x + dx && x + dx < this.width && 0 <= y + dy && y + dy < this.height) {
                            var ix = (y + dy) * this.width + (x + dx);
                            sum += this.alphaMap[ix];
                            count++;
                        }
                    }
                }
                blurred[y * this.width + x] = sum / count;
            }
        }
        this.alphaMap = blurred;
    },

    getResult: function () {
        var minx = null;
        out: for (var x = 0; x < this.width; x++) {
            for (var y = 0, ix = x; y < this.height; y++, ix += this.width) {
                if (this.alphaMap[ix]) {
                    minx = x;
                    break out;
                }
            }
        }

        var miny = null;
        out: for (var y = 0; y < this.height; y++) {
            for (var x = 0, ix = y * this.width; x < this.width; x++, ix++) {
                if (this.alphaMap[ix]) {
                    miny = y;
                    break out;
                }
            }
        }

        var maxx = null;
        out: for (var x = this.width - 1; 0 <= x; x--) {
            for (var y = 0, ix = x; y < this.height; y++, ix += this.width) {
                if (this.alphaMap[ix]) {
                    maxx = x;
                    break out;
                }
            }
        }

        var maxy = null;
        out: for (var y = this.height - 1; 0 <= y; y--) {
            for (var x = 0, ix = y * this.width; x < this.width; x++, ix++) {
                if (this.alphaMap[ix]) {
                    maxy = y;
                    break out;
                }
            }
        }

        return {
            top:    miny || 0,
            left:   minx || 0,
            height: (maxy || -1) + 1 - (miny || 0),
            width:  (maxx || -1) + 1 - (minx || 0),
            data:   this.alphaMap.slice(0)
        };
    },
}

/* WebWorker things */

self.addEventListener('message', function (e) {
    switch (e.data.method) {
        case "loadImage":
            Growcut.loadImage(e.data.width, e.data.height, e.data.sourceImage);
            self.postMessage({ method: "loadImage-complete" });
            break;
        case "initialize":
            Growcut.initialize(e.data.seedImage);
            self.postMessage({ method: "initialize-complete" });
            break;
        case "forwardGeneration":
            self.postMessage({ method: "forwardGeneration-complete", updated: Growcut.forwardGeneration() });
            break;
        case "blurResult":
            Growcut.blurResult(e.data.radius);
            self.postMessage({ method: "blurResult-complete" });
            break;
        case "getResult":
            self.postMessage({ method: "getResult-complete", result: Growcut.getResult() });
            break;
    }
});
