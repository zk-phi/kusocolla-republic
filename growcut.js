var Growcut = {
    /* fields */
    width:         0,  /* width in pixels */
    height:        0,  /* height in pixels */
    sourceMap:     [], /* (width * height) array of [R, G, B] (0 - 255 each) */
    labelMap:      [], /* (width * height) array of 0 (unknown), 1 (bg) or 2 (fg) */
    distanceMap:   [], /* (width * height)^2 array of the similarity of each adjacent colors (0.0 - 1.0) */
    reliablityMap: [], /* (width * height) array of the reliablity of each labels (0.0 - 1.0) */

    /* Internal: Set distanceMap for a cell-pair. */
    _setDistanceOfTwoCells: function (ix, ix2) {
        if (!this.distanceMap[ix])  this.distanceMap[ix] = [];
        if (!this.distanceMap[ix2]) this.distanceMap[ix2] = [];

        var distance = ix == ix2 ? 0 : Math.sqrt(
            Math.pow(this.sourceMap[ix][0] - this.sourceMap[ix2][0], 2)
            + Math.pow(this.sourceMap[ix][1] - this.sourceMap[ix2][1], 2)
            + Math.pow(this.sourceMap[ix][2] - this.sourceMap[ix2][2], 2)
        ) / 255 / Math.sqrt(3);

        this.distanceMap[ix][ix2] = this.distanceMap[ix2][ix] = 1.0 - distance;
    },

    /* Initialize the growcut engine. */
    initialize: function (width, height, sourceImage, seedImage) {
        this.width         = width;
        this.height        = height;
        this.sourceMap     = sourceImage;
        this.labelMap      = seedImage.slice(0);
        this.reliablityMap = seedImage.map(function (x) { return x ? 1 : 0; }); /* seeded or not */

        distanceMap = [];
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
                this._setDistanceOfTwoCells(ix, ix);
                if (x + 1 < width) this._setDistanceOfTwoCells(ix, ix + 1);
                if (y + 1 < height) {
                    this._setDistanceOfTwoCells(ix, ix + width);
                    if (x > 0) this._setDistanceOfTwoCells(ix, (ix + width) - 1);
                    if (x + 1 < width) this._setDistanceOfTwoCells(ix, ix + width + 1);
                }
            }
        }
    },

    /* Compute a step forward. */
    forwardGeneration: function () {
        var updated = 0;

        for (var x = 0; x < this.width; x++) {
            for (var y = 0; y < this.height; y++) {
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
                if (this.labelMap[ix] != next.label) updated++;
                this.reliablityMap[ix] = next.rel;
                this.labelMap[ix]      = next.label;
            }
        }

        return updated;
    },

    getResult: function () {
        return this.labelMap.slice(0);
    }
}
