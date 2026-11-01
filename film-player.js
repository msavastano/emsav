/* The film player (markup comes from player() in scripts/build-films.mjs).
   Without this script each film is a plain <video> with native controls, which still works.
   With it:
   - the poster shows one big play button, and the native controls appear once the film starts;
   - starting any video pauses every other video on the page;
   - if the film can't load, a short message says so. */
(function () {
  'use strict';

  // 'play' doesn't bubble, so listen in the capture phase to hear every video on the page.
  document.addEventListener('play', function (e) {
    var videos = document.querySelectorAll('video');
    for (var i = 0; i < videos.length; i++) {
      if (videos[i] !== e.target && !videos[i].paused) videos[i].pause();
    }
  }, true);

  function setup(player) {
    var video = player.querySelector('video');
    var button = player.querySelector('.film-play');
    var error = player.querySelector('.film-error');
    if (!video || !button) return;

    function fail() {
      player.classList.add('has-error');
      button.hidden = true;
      video.controls = true;
      if (error) error.textContent = 'This film couldn\u2019t load. Please try again in a moment.';
    }

    // Hide the native controls until the first play, so the poster shows one clear button.
    video.controls = false;
    button.hidden = false;

    button.addEventListener('click', function () {
      var p = video.play();
      if (p && p.catch) {
        p.catch(function (err) {
          // AbortError just means another film started first; anything else means it can't play.
          if (err && err.name !== 'AbortError') fail();
        });
      }
    });

    video.addEventListener('play', function () {
      if (player.classList.contains('has-played')) return;
      var hadFocus = document.activeElement === button;
      player.classList.add('has-played');
      video.controls = true;
      button.hidden = true;
      // Keep keyboard users on the film, so Space pauses it and Tab reaches the controls.
      if (hadFocus) video.focus();
    });

    // A failed source fires 'error' on the <source>, not on the <video>.
    var sources = video.querySelectorAll('source');
    if (sources.length) sources[sources.length - 1].addEventListener('error', fail);
    video.addEventListener('error', fail);
  }

  var players = document.querySelectorAll('.film-player');
  for (var i = 0; i < players.length; i++) setup(players[i]);
})();
