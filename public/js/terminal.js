$(function () {
  var socket = io.connect();

  var $screens = $('.screen');
  var $screenIdle = $('#screen-idle');
  var $screenInfo = $('#screen-info');
  var $screenSignature = $('#screen-signature');
  var $id = $('.terminal-id');

  var gestures = [];
  var gesture = [];
  var gestureStart;

  var $canvas = $('#screen-signature').find('canvas');
  var canvas;
  var canvasOffset;

  function setupCanvas($canvas) {
    console.log('setupCanvas()');
    canvas = $canvas.get(0);
    canvas.width = $canvas.parent().width();
    canvas.height = $canvas.parent().height();
    canvasOffset = $canvas.offset();
  }
  setupCanvas($canvas);

  var canvasContext = canvas.getContext('2d');
  canvasContext.strokeStyle = '#000';
  canvasContext.lineWidth = 3;

  window.addEventListener('resize', function () {
    setupCanvas($canvas);
  });

  canvas.addEventListener('touchstart', function(e) {
    if(gesture.length) {
      gestures.push(gesture);
      gesture = [];
    }
    gestureStart = Date.now();
    canvasContext.beginPath();
    var x = e.changedTouches[0].pageX - canvasOffset.left;
    var y = e.changedTouches[0].pageY - canvasOffset.top;
    canvasContext.moveTo(x, y);
    gesture.push([x, y, 0]);
  }, false);

  canvas.addEventListener('touchmove', function (e) {
    e.preventDefault();
    var x = e.changedTouches[0].pageX - canvasOffset.left;
    var y = e.changedTouches[0].pageY - canvasOffset.top;
    canvasContext.lineTo(x, y);
    canvasContext.stroke();
    gesture.push([x, y, Date.now() - gestureStart]);
  } ,false);

  function resetCanvas() {
    gestures = [];
    gesture = [];
    canvasContext.clearRect(0, 0, canvas.width, canvas.height);
  }

  socket.on('registered', function (data) {
    $id.text(data.id);
  });

  socket.on('sign', function (data) {
    console.log(data);
    $screens.hide();
    $screenInfo.find('#info-user').text(data.user);
    $screenInfo.find('#info-time').text(data.time);
    $screenInfo.find('#info-notes').text(data.notes);
    $screenSignature.find('.action-submit').data('id', data.id);
    $screenInfo.show();
  });

  $('.action-cancel').click(function () {
    $screens.hide();
    $screenIdle.show();
  });

  $('.action-signature').click(function (data) {
    $screens.hide();
    resetCanvas();
    $screenSignature.show();
  });

  $('.action-reset').click(function (data) {
    resetCanvas();
  });

  $('.action-submit').click(function (data) {
    if(gesture.length) {
      gestures.push(gesture);
      gesture = [];
    }
    if(gestures.length) {
      var id = $(this).data('id');
      socket.emit('signed', {
        id: id,
        width: canvas.width,
        height: canvas.height,
        gestures: gestures,
      });
      $screens.hide();
      $screenIdle.show();
    }
  });

  $screens.hide();
  $screenIdle.show();
  socket.emit('register');
});
