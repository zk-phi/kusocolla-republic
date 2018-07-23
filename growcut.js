/* A simple growcut segmenter written in js / zk_phi */

var Growcut = {
    /* fields */
    width:         0,  /* width in pixels */
    height:        0,  /* height in pixels */
    sourceMap:     [], /* (width * height) array of [R, G, B] (0 - 255 each) */
    labelMap:      [], /* (width * height) array of 0 (bg), 1 (fg) or undefined */
    distanceMap:   [], /* (width * height)^2 array of the similarity of each adjacent colors (0.0 - 1.0) */
    reliablityMap: [], /* (width * height) array of the reliablity of each labels (0.0 - 1.0) */
    updatedCells:  [], /* list of recently updated [X, Y] s (for optimization) */

    /* Initialize the growcut engine. */
    loadImage: function (width, height, sourceImage) {
        this.width     = width;
        this.height    = height;
        this.sourceMap = sourceImage;

        this.distanceMap = [];

        var _setDistanceOfTwoCells = function (ix, ix2) {
            if (!this.distanceMap[ix])  this.distanceMap[ix] = [];
            if (!this.distanceMap[ix2]) this.distanceMap[ix2] = [];

            var distance = ix == ix2 ? 0 : Math.sqrt(
                Math.pow(this.sourceMap[ix][0] - this.sourceMap[ix2][0], 2)
                + Math.pow(this.sourceMap[ix][1] - this.sourceMap[ix2][1], 2)
                + Math.pow(this.sourceMap[ix][2] - this.sourceMap[ix2][2], 2)
            ) / 255 / Math.sqrt(3);

            this.distanceMap[ix][ix2] = this.distanceMap[ix2][ix] = 1.0 - distance;
        }.bind(this);

        for (var x = 0; x < width; x++) {
            for (var y = 0; y < height; y++) {
                var ix = y * width + x;
                /*     x - 1        x        x + 1
                   +------------+--------+------------+
                   | -          | -      | -          | y - 1
                   +------------+--------+------------+
                   | -          | ix     | ix + 1     | y
                   +------------+--------+------------+
                   | ix + w - 1 | ix + w | ix + w + 1 | y + 1
                   +------------+--------+------------+
                 */
                _setDistanceOfTwoCells(ix, ix);
                if (x + 1 < width) _setDistanceOfTwoCells(ix, ix + 1);
                if (y + 1 < height) {
                    _setDistanceOfTwoCells(ix, ix + width);
                    if (x > 0) _setDistanceOfTwoCells(ix, (ix + width) - 1);
                    if (x + 1 < width) _setDistanceOfTwoCells(ix, ix + width + 1);
                }
            }
        }
    },

    initialize: function (seedImage) {
        this.labelMap      = seedImage.slice(0);
        this.reliablityMap = [];
        this.updatedCells  = [];
        for (var x = 0; x < this.width; x++) {
            for (var y = 0; y < this.height; y++) {
                var ix = y * this.width + x;
                this.reliablityMap[ix] = seedImage[ix] < 2 ? 1 : 0
                if (this.reliablityMap[ix]) this.updatedCells.push([x, y]);
            }
        }
    },

    /* Compute a step forward. */
    forwardGeneration: function () {
        var updated = 0;

        var targetCells = [];
        for (var i = 0; i < this.updatedCells.length; i++) {
            var x = this.updatedCells[i][0];
            var y = this.updatedCells[i][1];
            [-1, 0, 1].forEach(function (dx) {
                [-1, 0, 1].forEach(function (dy) {
                    if (0 < x + dx && x + dx < this.width && 0 < y + dy && y + dy < this.height) {
                        targetCells.push([x + dx, y + dy]);
                    }
                }.bind(this));
            }.bind(this))
        }

        this.updatedCells = [];
        for (var i = 0; i < targetCells.length; i++) {
            var x  = targetCells[i][0];
            var y  = targetCells[i][1];
            var ix = y * this.width + x;

            var adjacentCells = [];
            [-1, 0, 1].forEach(function (dx) {
                [-1, 0, 1].forEach(function (dy) {
                    if (0 < x + dx && x + dx < this.width && 0 < y + dy && y + dy < this.height) {
                        var ix2 = (y + dy) * this.width + (x + dx);
                        adjacentCells.push({
                            label: this.labelMap[ix2],
                            rel:   this.reliablityMap[ix2] * this.distanceMap[ix][ix2]
                        });
                    }
                }.bind(this));
            }.bind(this));

            var next = adjacentCells.reduce(function (x, y) { return x.rel < y.rel ? y : x; });
            if (this.labelMap[ix] != next.label || this.reliablityMap[ix] != next.rel) {
                updated++;
                this.updatedCells.push([x, y]);
            }
            this.reliablityMap[ix] = next.rel;
            this.labelMap[ix]      = next.label;
        }

        return updated;
    },

    blurResult: function (radius) {
        var blurred = [];
        for (var x = 0; x < this.width; x++) {
            cell: for (var y = 0; y < this.height; y++) {
                var sum   = 0;
                var count = 0;
                for (var dx = - radius; dx <= radius; dx++) {
                    for (var dy = - radius; dy <= radius; dy++) {
                        if (0 < x + dx && x + dx < this.width && 0 < y + dy && y + dy < this.width) {
                            var ix = (y + dy) * this.width + (x + dx);
                            if (this.labelMap[ix] < 2) {
                                sum += this.labelMap[ix];
                                count++;
                            } else {
                                blurred[y * this.width + x] = undefined;
                                continue cell;
                            }
                        }
                    }
                }
                blurred[y * this.width + x] = sum / count;
            }
        }
        this.labelMap = blurred;
    },

    getResult: function () {
        return this.labelMap.slice(0);
    }
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
