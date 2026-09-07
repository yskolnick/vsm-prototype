/* "Send to the team" for the pindrop review overlay.
 * Adds one button to pindrop's Finish review sheet. It opens a pre-filled GitHub issue in this
 * project's repository containing the review summary and the JSON packet. A workflow in the
 * repository then files the packet under feedback/ and answers on the issue. Leaves pindrop.js
 * (vendored unchanged from yskolnick/pindrop) untouched: it only uses window.pindrop.buildReviewPacket.
 */
(function () {
  if (window.pindropSend) return;
  var REPO = 'yskolnick/Virtual-Singles-Mixer';
  var MAX_URL = 7600; // GitHub rejects very long issue URLs; stay under ~8 KB

  function pageLabel(packet) {
    var path = (packet.page && packet.page.pathname) || location.pathname;
    var parts = path.replace(/\/+$/, '').split('/').filter(Boolean);
    return parts.length ? parts.slice(-2).join('/') : 'landing page';
  }
  function slim(packet) {
    // Drop the bulky diagnostic fields first; the workflow can live without them.
    var copy = JSON.parse(JSON.stringify(packet));
    delete copy.environment;
    delete copy.stateCatalog;
    return copy;
  }
  function body(packet, withJson) {
    var lines = [];
    lines.push('Feedback pinned on **' + pageLabel(packet) + '** by ' + (packet.reviewer || 'a reviewer') + ' on ' + packet.exportedAt.slice(0, 10) + '.');
    lines.push('');
    lines.push('Page: ' + (packet.page && packet.page.url ? packet.page.url : location.href));
    lines.push('');
    lines.push('## Summary');
    lines.push('');
    lines.push(packet.summary || '(no notes)');
    lines.push('');
    if (withJson) {
      lines.push('<details><summary>Packet (filed automatically, do not edit)</summary>');
      lines.push('');
      lines.push('```json');
      lines.push(JSON.stringify(withJson, null, 1));
      lines.push('```');
      lines.push('');
      lines.push('</details>');
    } else {
      lines.push('_The packet was too large for a link. Please attach the downloaded `.json` file to this issue._');
    }
    return lines.join('\n');
  }
  function issueUrl(packet) {
    var title = 'Feedback: ' + pageLabel(packet) + ' (' + packet.exportedAt.slice(0, 10) + ')';
    var attempts = [packet, slim(packet), null];
    for (var i = 0; i < attempts.length; i++) {
      var u = 'https://github.com/' + REPO + '/issues/new?labels=' + encodeURIComponent('feedback') +
        '&title=' + encodeURIComponent(title) + '&body=' + encodeURIComponent(body(packet, attempts[i]));
      if (u.length <= MAX_URL || i === attempts.length - 1) return { url: u, complete: attempts[i] !== null };
    }
  }
  function send(status) {
    if (!window.pindrop || typeof window.pindrop.buildReviewPacket !== 'function') {
      if (status) status.textContent = 'The review overlay is not loaded';
      return;
    }
    var packet = window.pindrop.buildReviewPacket();
    var r = issueUrl(packet);
    var w = window.open(r.url, '_blank', 'noopener');
    if (status) {
      status.textContent = w
        ? (r.complete ? 'GitHub opened in a new tab · check the text and press Submit new issue' : 'GitHub opened · the packet was too big for a link: use Download packet and attach it')
        : 'Pop-up blocked · allow pop-ups for this site and try again';
    }
  }
  function decorate(sheet) {
    if (sheet.querySelector('.pd-send-team')) return;
    var actions = sheet.querySelector('.pd-finish-actions');
    if (!actions) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'p pd-send-team';
    btn.textContent = 'Send to the team';
    btn.title = 'Opens a GitHub issue with your notes already filled in';
    btn.addEventListener('click', function () { send(sheet.querySelector('.pd-finish-status')); });
    actions.appendChild(btn);
    var hint = document.createElement('p');
    hint.className = 'pd-meta';
    hint.textContent = 'Send to the team files your notes in the project (you need to be signed in to GitHub).';
    actions.parentNode.insertBefore(hint, actions.nextSibling);
  }
  var mo = new MutationObserver(function (records) {
    for (var i = 0; i < records.length; i++) {
      var added = records[i].addedNodes;
      for (var j = 0; j < added.length; j++) {
        var n = added[j];
        if (n.nodeType === 1 && n.classList && n.classList.contains('pd-finish')) decorate(n);
      }
    }
  });
  function start() { mo.observe(document.body, { childList: true }); var s = document.querySelector('.pd-finish'); if (s) decorate(s); }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
  window.pindropSend = { version: '1.0.0', issueUrl: issueUrl, send: send };
})();
