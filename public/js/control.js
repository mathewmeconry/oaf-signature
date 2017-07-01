$(function () {
  var socket = io.connect();
  var $list = $('#list');

  $('.refresh').on('click', function (e) {
    e.preventDefault();
    socket.emit('refresh');
  });

  $list.on('click', '.send', function () {
    var $this = $(this);
    var terminalId = $this.data('id');
    var entryId = $this.closest('ul').closest('li').data('id');
    socket.emit('sign', { entry: entryId, terminal: terminalId });
  });

  socket.on('data', function (data) {
    console.log(data);
    $list.empty();
    for(var i in data.entries) {
      var entry = data.entries[i];
      var $entry = $('<li><span></span><ul></ul></li>');
      var label = '#' + entry.id + ' ' + entry.user + ' (' + entry.time + ')';
      $entry.find('span').text(label);
      $entry.data('id', data.entries[i].id);
      for(var id in data.terminals) {
        var $terminal = $('<li><a class="send"></a></li>');
        $terminal.find('a').data('id', id).text(data.terminals[id].label);
        $entry.find('ul').append($terminal);
      }
      $list.append($entry);
    }
  });

  socket.emit('fetch');
});
