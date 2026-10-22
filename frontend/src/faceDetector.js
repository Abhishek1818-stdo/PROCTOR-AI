
import {
  FaceDetector,
  FilesetResolver,
} from '@mediapipe/tasks-vision'

let detectorPromise = null

export async function getFaceDetector() {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      )

      return FaceDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
          delegate: 'CPU',
        },
        runningMode: 'VIDEO',
        minDetectionConfidence: 0.5,
      })
    })().catch((error) => {
      detectorPromise = null
      throw error
    })
  }

  return detectorPromise
}
