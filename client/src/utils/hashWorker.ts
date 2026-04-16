import SparkMD5 from 'spark-md5';

const CHUNK_SIZE = 2 * 1024 * 1024;

self.onmessage = (e: MessageEvent<File>) => {
  const file = e.data;
  const chunks = Math.ceil(file.size / CHUNK_SIZE);
  const spark = new SparkMD5.ArrayBuffer();
  let currentChunk = 0;

  const reader = new FileReader();

  reader.onload = (ev) => {
    if (ev.target?.result) {
      spark.append(ev.target.result as ArrayBuffer);
    }
    currentChunk++;
    self.postMessage({
      type: 'progress',
      percentage: Math.round((currentChunk / chunks) * 100),
    });

    if (currentChunk < chunks) {
      loadNext();
    } else {
      self.postMessage({ type: 'done', hash: spark.end() });
    }
  };

  reader.onerror = () => {
    self.postMessage({ type: 'error', message: 'Failed to read file' });
  };

  function loadNext() {
    const start = currentChunk * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    reader.readAsArrayBuffer(file.slice(start, end));
  }

  loadNext();
};
