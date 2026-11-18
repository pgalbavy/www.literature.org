"use strict";
function w3_open() {
  const sidebar = document.getElementById("sidebar");
  if (sidebar) sidebar.style.display = "block";
}
function w3_close() {
  const sidebar = document.getElementById("sidebar");
  if (sidebar) sidebar.style.display = "none";
}
window.w3_open = w3_open;
window.w3_close = w3_close;
