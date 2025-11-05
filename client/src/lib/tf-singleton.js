import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-webgl";

(async () => {
  try {
    await tf.setBackend("webgl");
    await tf.ready();
  } catch {}
})();

export { tf };
