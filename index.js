var AudioContext = window.AudioContext || window.webkitAudioContext

function createWorker (fn) {
  var js = fn
    .toString()
    .replace(/^function\s*\(\)\s*{/, '')
    .replace(/}$/, '')
  var blob = new Blob([js])
  return new Worker(URL.createObjectURL(blob))
}

function error (method) {
  var event = new Event('error')
  event.data = new Error('Wrong state for ' + method)
  return event
}

var context

/**
 * Audio Recorder with MediaRecorder API.
 *
 * @param {MediaStream} stream The audio stream to record.
 *
 * @example
 * navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
 *   var recorder = new MediaRecorder(stream)
 * })
 *
 * @class
 */
function MediaRecorder (stream) {
  /**
   * The `MediaStream` passed into the constructor.
   * @type {MediaStream}
   */
  this.stream = stream

  /**
   * The current state of recording process.
   * @type {"inactive"|"recording"}
   */
  this.state = 'inactive'

  this.em = document.createDocumentFragment()
  this.encoder = createWorker(MediaRecorder.encoder)

  var recorder = this
  this.encoder.addEventListener('message', function (e) {
    var event = new Event('dataavailable')
    event.data = new Blob([e.data], { type: recorder.mimeType })
    recorder.em.dispatchEvent(event)
    if (recorder.state === 'inactive') {
      recorder.em.dispatchEvent(new Event('stop'))
    }
  })
}

MediaRecorder.prototype = {
  /**
   * The MIME type that is being used for recording.
   * @type {string}
   */
  mimeType: 'audio/wav',

  /**
   * Begins recording media.
   *
   * @param {number} [timeslice] The milliseconds to record into each `Blob`.
   *                             If this parameter isn’t included, single `Blob`
   *                             will be recorded.
   *
   * @return {undefined}
   *
   * @example
   * recordButton.addEventListener('click', function () {
   *   recorder.start()
   * })
   */
  start: function start ( maxSeconds ) {

    maxSeconds = maxSeconds || 30

    if ( this.state !== 'inactive' )
      return this.em.dispatchEvent( error('start') )

    var recorder = this

    this.seconds = 0
    this.state = 'recording'
    
    this.secondsTimer = setInterval( function() {

      recorder.seconds++

      var event = new Event('duration')
      event.data = recorder.seconds
      recorder.em.dispatchEvent( event )
      
    }, 1000 )

    if ( !context )
      context = new AudioContext()

    var input = context.createMediaStreamSource( this.stream )
    var processor = context.createScriptProcessor( 2048, 1, 1 )

    processor.onaudioprocess = function (e) {
      if (recorder.state === 'recording')
        recorder.encoder.postMessage([ 'encode', e.inputBuffer.getChannelData(0) ])
    }

    input.connect(processor)
    processor.connect(context.destination)

    this.em.dispatchEvent(new Event('start'))

    this.stopTimeout = setTimeout( function() { recorder.stop() }, maxSeconds * 1000 )

  },

  /**
   * Stop media capture and raise `dataavailable` event with recorded data.
   *
   * @return {undefined}
   *
   * @example
   * finishButton.addEventListener('click', function () {
   *   recorder.stop()
   * })
   */
  stop: function stop ( forced ) {

    if (this.state === 'inactive') 
      return this.em.dispatchEvent(error('stop'))

    !forced && this.requestData()
    this.state = 'inactive'
    clearInterval( this.secondsTimer )
    clearTimeout( this.stopTimeout )

    this.stream.getTracks().forEach( function(i) { i.stop() })

  },

  /**
   * Raise a `dataavailable` event containing the captured media.
   *
   * @return {undefined}
   *
   * @example
   * this.on('nextData', function () {
   *   recorder.requestData()
   * })
   */
  requestData: function requestData () {

    if ( this.state === 'inactive' )
      return this.em.dispatchEvent( error('requestData') )

    return this.encoder.postMessage( ['dump', context.sampleRate] )
    
  },

  /**
   * Add listener for specified event type.
   *
   * @param {"start"|"stop"|"dataavailable"|"error"}
   * type Event type.
   * @param {function} listener The listener function.
   *
   * @return {undefined}
   *
   * @example
   * recorder.addEventListener('dataavailable', function (e) {
   *   audio.src = URL.createObjectURL(e.data)
   * })
   */
  addEventListener: function addEventListener () {
    this.em.addEventListener.apply(this.em, arguments)
  },

  /**
   * Remove event listener.
   *
   * @param {"start"|"stop"|"dataavailable"|"error"}
   * type Event type.
   * @param {function} listener The same function used in `addEventListener`.
   *
   * @return {undefined}
   */
  removeEventListener: function removeEventListener () {
    this.em.removeEventListener.apply(this.em, arguments)
  },

  /**
   * Calls each of the listeners registered for a given event.
   *
   * @param {Event} event The event object.
   *
   * @return {boolean} Is event was no canceled by any listener.
   */
  dispatchEvent: function dispatchEvent () {
    this.em.dispatchEvent.apply(this.em, arguments)
  }
}

/**
 * `true` if MediaRecorder can not be polyfilled in the current browser.
 * @type {boolean}
 *
 * @example
 * if (MediaRecorder.notSupported) {
 *   showWarning('Audio recording is not supported in this browser')
 * }
 */
MediaRecorder.notSupported = !navigator.mediaDevices || !AudioContext

/**
 * Converts RAW audio buffer to compressed audio files.
 * It will be loaded to Web Worker.
 * By default, WAVE encoder will be used.
 * @type {function}
 *
 * @example
 * MediaRecorder.prototype.mimeType = 'audio/ogg'
 * MediaRecorder.encoder = oggEncoder
 */
MediaRecorder.encoder = require('./wave-encoder')

module.exports = MediaRecorder