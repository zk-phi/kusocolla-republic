背景抜き太郎: http://zk-phi.github.io/kusocolla-republic

# 背景抜き太郎 (index.html, script.js)

canvas + webworker を使ってブラウザ上でゴリゴリ画像処理するサンプルです。

普通に使えると思うので、よしなに遊んでください。

# growcut.js

背景分離 (画像セグメンテーション) アルゴリズム "growcut" の js 実装です。

## 1. 元画像を用意する

元画像を `[R, G, B]` x ピクセル数 の配列で用意します。

```javascript
var sourceImage = [...];
var imageWidth  = ...;
var imageHeight = sourceImage.length / imageWidth;
```

画像ファイルから作る場合は、いったん canvas に流してから `getImageData` を使うと取れます。

```javascript
var context = canvas.getContext('2d');
context.drawImage(image, 0, 0);
var data = context.getImageData.data; // こいつは R, G, B, A, R, G, B, A, ... が一列に並んだ配列

// [R, G, B], [R, G, B], ... の形に直してやる
var sourceImage = [];
for (var x = 0; x < image.naturalWidth; x++) {
  for (var y = 0; y < image.naturalHeight; y++) {
    var index = y * image.naturalWidth + x;
    sourceImage[index] = [data[index * 4], data[index * 4 + 1], data[index * 4 + 2]];
  }
}
```

用意した画像を growcut エンジンに渡します。

```javascript
Growcut.loadImage(imageWidth, imageHeight, sourceImage);
```

## 2. 前景・背景のヒントを用意する

前景・背景のヒントデータを `0` (確実に背景), `1` (確実に前景), `undefined` (おまかせ) の配列として用意します。

たいていはユーザーの入力から生成する感じになると思います。

```javascript
var seedImage = [...];
```

用意したヒントデータを growcut エンジンに渡します。

```javascript
Growcut.initialize(seedImage);
```

## 3. growcut を開始する

`forwardGeneration` 関数で growcut を一世代進めることができます。この関数は前の世代から変化のあったセルの数を返すので、たいていの場合、 `0` になるまで (収束するまで) 繰り返すことになると思います。

```javascript
var updated;
do {
  updated = Growcut.forwardGeneration();
  console.log(updated);
} while (updated);
```


## 4. 結果を取得

`getResult` 関数で growcut の結果を取得します。結果は `seedImage` と同様に、それぞれのピクセルが背景 (`0`) か前景 (`1`) かを並べた配列で返ります。 *growcut が収束していれば* `undefined` は含まれません。

## WebWorker から使う

WebWorker 用のインターフェースが用意してあるので、 WebWorker を利用して非同期に、マルチスレッドで実行することもできます。

JSONRPC のように、 worker へのメッセージに `{ method: "関数名", ...引数s }` を送ることでその関数を非同期に呼び出すことができ、完了すると worker は `{ method: "関数名-complete", ...戻り値 }` を送り返してきます。

```javascript
var worker = new Worker("growcut.js");

worker.postMessage({ method: "loadImage", width: imageWidth, height: imageHeight, sourceImage: sourceImage });

var result;
worker.addEventListener(('message'), function (e) {
  switch (e.data.method) {
    case "loadImage-complete":
      worker.postMessage({ method: "initialize", seedImage: seedImage });
      break;
    case "initialize-complete":
      worker.postMessage({ method: "forwardGeneration" });
      break;
    case "forwardGeneration-complete":
      worker.postMessage({ method: e.data.updated ? "forwardGeneration" : "getResult" });
      break;
    case "getResult-complete":
      result = e.data.result;
      break;
  }
});
```

※本当は `postMessage` は `addEventListener` の後に書くのが適切ですが、わかりやすいので説明用にこの順にしています
