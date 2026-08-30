(function(){
  "use strict";

  var DEVICE_KEY = "bidamax_voucher_device_id_v1";
  var VOUCHER_KEY = "bidamax_remove_ads_voucher_v1";
  var VOUCHER_CREATED_KEY = "bidamax_remove_ads_voucher_created_v1";
  var VOUCHER_EXPIRES_KEY = "bidamax_remove_ads_voucher_expires_v1";
  var VOUCHER_LIFETIME_MS = 2 * 24 * 60 * 60 * 1000;
  var countdownTimer = null;

  var voucherBox = document.getElementById("voucherBox");
  var statusText = document.getElementById("statusText");
  var expiryCountdown = document.getElementById("expiryCountdown");
  var generateBtn = document.getElementById("generateBtn");
  var copyBtn = document.getElementById("copyBtn");

  function randomHex(length){
    var out = "";
    var bytes = new Uint8Array(Math.ceil(length / 2));

    if(window.crypto && window.crypto.getRandomValues){
      window.crypto.getRandomValues(bytes);
    }else{
      for(var i=0;i<bytes.length;i++){
        bytes[i] = Math.floor(Math.random() * 256);
      }
    }

    for(var j=0;j<bytes.length;j++){
      out += bytes[j].toString(16).padStart(2,"0");
    }

    return out.slice(0,length).toUpperCase();
  }

  function getOrCreateDeviceId(){
    var existing = localStorage.getItem(DEVICE_KEY);

    if(existing){
      return existing;
    }

    var id =
      "DEV-" +
      randomHex(8) + "-" +
      Date.now().toString(36).toUpperCase();

    localStorage.setItem(DEVICE_KEY,id);
    return id;
  }

  async function sha256(text){
    if(window.crypto && window.crypto.subtle){
      var encoded = new TextEncoder().encode(text);
      var digest = await window.crypto.subtle.digest("SHA-256",encoded);
      return Array.from(new Uint8Array(digest))
        .map(function(b){return b.toString(16).padStart(2,"0");})
        .join("")
        .toUpperCase();
    }

    // Fallback for very old WebViews/browsers.
    var hash = 2166136261;
    for(var i=0;i<text.length;i++){
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash,16777619);
    }

    return (
      ("00000000" + (hash >>> 0).toString(16)).slice(-8) +
      randomHex(16)
    ).toUpperCase();
  }

  function formatVoucher(raw){
    var clean = raw.replace(/[^A-Z0-9]/g,"").slice(0,12);
    return clean.match(/.{1,4}/g).join("-");
  }

  async function buildVoucher(deviceId){
    /*
     * Stable per browser/device:
     * same saved device ID -> same voucher.
     *
     * IMPORTANT:
     * Final anti-sharing enforcement will be handled later by the
     * app/backend redemption system. Do not use this frontend alone
     * as the final source of truth.
     */
    var seed = "BIDAMAX-REMOVE-ADS|" + deviceId;
    var hash = await sha256(seed);
    return formatVoucher(hash.slice(0,12));
  }

  function clearVoucher(){
    localStorage.removeItem(VOUCHER_KEY);
    localStorage.removeItem(VOUCHER_CREATED_KEY);
    localStorage.removeItem(VOUCHER_EXPIRES_KEY);

    if(countdownTimer){
      clearInterval(countdownTimer);
      countdownTimer = null;
    }

    voucherBox.textContent = "XXXX-XXXX-XXXX";
    copyBtn.disabled = true;
    expiryCountdown.hidden = true;
    expiryCountdown.classList.remove("expired");
  }

  function getExpiryTime(){
    return Number(localStorage.getItem(VOUCHER_EXPIRES_KEY) || 0);
  }

  function voucherExpired(){
    var expires = getExpiryTime();
    return !expires || Date.now() >= expires;
  }

  function formatRemaining(ms){
    if(ms < 0) ms = 0;

    var totalSeconds = Math.floor(ms / 1000);
    var days = Math.floor(totalSeconds / 86400);
    var hours = Math.floor((totalSeconds % 86400) / 3600);
    var minutes = Math.floor((totalSeconds % 3600) / 60);
    var seconds = totalSeconds % 60;

    return days + "d " +
      String(hours).padStart(2,"0") + "h " +
      String(minutes).padStart(2,"0") + "m " +
      String(seconds).padStart(2,"0") + "s";
  }

  function updateCountdown(){
    var expires = getExpiryTime();

    if(!expires){
      expiryCountdown.hidden = true;
      return;
    }

    var remaining = expires - Date.now();

    if(remaining <= 0){
      expiryCountdown.hidden = false;
      expiryCountdown.classList.add("expired");
      expiryCountdown.textContent = "Voucher expired";

      clearVoucher();
      expiryCountdown.hidden = false;
      expiryCountdown.classList.add("expired");
      expiryCountdown.textContent = "Voucher expired. Generate a new voucher.";
      statusText.textContent = "Your previous voucher has expired.";
      return;
    }

    expiryCountdown.hidden = false;
    expiryCountdown.classList.remove("expired");
    expiryCountdown.textContent = "Expires in: " + formatRemaining(remaining);
  }

  function startCountdown(){
    if(countdownTimer){
      clearInterval(countdownTimer);
    }

    updateCountdown();

    countdownTimer = setInterval(function(){
      updateCountdown();
    },1000);
  }

  function showVoucher(voucher,isExisting){
    voucherBox.textContent = voucher;
    copyBtn.disabled = false;

    if(isExisting){
      statusText.textContent = "This device already has an active voucher.";
    }else{
      statusText.textContent = "Voucher generated successfully.";
    }

    startCountdown();
  }

  async function generateVoucher(){
    generateBtn.disabled = true;
    statusText.classList.remove("copied");
    statusText.textContent = "Generating...";

    try{
      var existingVoucher = localStorage.getItem(VOUCHER_KEY);

      if(existingVoucher && !voucherExpired()){
        showVoucher(existingVoucher,true);
        return;
      }

      if(existingVoucher && voucherExpired()){
        clearVoucher();
      }

      var deviceId = getOrCreateDeviceId();
      var voucher = await buildVoucher(deviceId + "|" + Date.now());

      var createdAt = Date.now();
      var expiresAt = createdAt + VOUCHER_LIFETIME_MS;

      localStorage.setItem(VOUCHER_KEY,voucher);
      localStorage.setItem(VOUCHER_CREATED_KEY,String(createdAt));
      localStorage.setItem(VOUCHER_EXPIRES_KEY,String(expiresAt));

      showVoucher(voucher,false);
    }catch(e){
      statusText.textContent = "Unable to generate voucher.";
    }finally{
      generateBtn.disabled = false;
    }
  }

  async function copyVoucher(){
    var voucher = localStorage.getItem(VOUCHER_KEY);

    if(!voucher){
      return;
    }

    if(voucherExpired()){
      clearVoucher();
      statusText.textContent = "Voucher expired. Generate a new voucher.";
      expiryCountdown.hidden = false;
      expiryCountdown.classList.add("expired");
      expiryCountdown.textContent = "Voucher expired";
      return;
    }

    try{
      await navigator.clipboard.writeText(voucher);
    }catch(e){
      var temp = document.createElement("textarea");
      temp.value = voucher;
      temp.style.position = "fixed";
      temp.style.opacity = "0";
      document.body.appendChild(temp);
      temp.select();

      try{
        document.execCommand("copy");
      }catch(ignore){}

      temp.remove();
    }

    statusText.textContent = "Voucher copied.";
    statusText.classList.add("copied");

    setTimeout(function(){
      statusText.classList.remove("copied");
      statusText.textContent = "This device already has a voucher.";
    },1800);
  }

  generateBtn.addEventListener("click",generateVoucher);
  copyBtn.addEventListener("click",copyVoucher);

  // Restore existing voucher immediately.
  var savedVoucher = localStorage.getItem(VOUCHER_KEY);
  if(savedVoucher && !voucherExpired()){
    showVoucher(savedVoucher,true);
  }else if(savedVoucher && voucherExpired()){
    clearVoucher();
    statusText.textContent = "Your previous voucher has expired.";
    expiryCountdown.hidden = false;
    expiryCountdown.classList.add("expired");
    expiryCountdown.textContent = "Voucher expired. Generate a new voucher.";
  }
})();
