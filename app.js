(function(){
  "use strict";

  var DEVICE_KEY = "bidamax_voucher_generator_id_v2";
  var VOUCHER_KEY = "bidamax_voucher_code_v2";
  var EXPIRES_KEY = "bidamax_voucher_expires_v2";
  var SERVER_OFFSET_KEY = "bidamax_voucher_server_offset_v2";
  var timer = null;

  var voucherBox = document.getElementById("voucherBox");
  var statusText = document.getElementById("statusText");
  var expiryCountdown = document.getElementById("expiryCountdown");
  var generateBtn = document.getElementById("generateBtn");
  var copyBtn = document.getElementById("copyBtn");

  function randomHex(bytes){
    var a = new Uint8Array(bytes);
    crypto.getRandomValues(a);
    return Array.from(a).map(function(v){
      return v.toString(16).padStart(2,"0");
    }).join("");
  }

  function generatorId(){
    var id = localStorage.getItem(DEVICE_KEY);
    if(id) return id;

    id = "web-" + randomHex(16);
    localStorage.setItem(DEVICE_KEY,id);
    return id;
  }

  function serverNow(){
    var offset = Number(localStorage.getItem(SERVER_OFFSET_KEY) || 0);
    return Date.now() + offset;
  }

  function setServerTime(serverTime){
    if(!serverTime) return;
    localStorage.setItem(SERVER_OFFSET_KEY,String(Number(serverTime) - Date.now()));
  }

  function formatRemaining(ms){
    var s = Math.max(0,Math.floor(ms/1000));
    var d = Math.floor(s/86400);
    var h = Math.floor((s%86400)/3600);
    var m = Math.floor((s%3600)/60);
    var sec = s%60;
    return d+"d "+String(h).padStart(2,"0")+"h "+String(m).padStart(2,"0")+"m "+String(sec).padStart(2,"0")+"s";
  }

  function clearTimer(){
    if(timer){ clearInterval(timer); timer=null; }
  }

  function setActiveUi(active){
    if(active){
      generateBtn.disabled = true;
      generateBtn.textContent = "Voucher Active";
      copyBtn.disabled = false;
    }else{
      generateBtn.disabled = false;
      generateBtn.textContent = "Generate Voucher";
      copyBtn.disabled = true;
    }
  }

  function clearSavedVoucher(){
    localStorage.removeItem(VOUCHER_KEY);
    localStorage.removeItem(EXPIRES_KEY);
  }

  function updateCountdown(){
    var expires = Number(localStorage.getItem(EXPIRES_KEY)||0);
    if(!expires){
      expiryCountdown.hidden = true;
      setActiveUi(false);
      return;
    }

    var remaining = expires - serverNow();
    expiryCountdown.hidden = false;

    if(remaining <= 0){
      clearTimer();
      clearSavedVoucher();
      voucherBox.textContent = "XXXX-XXXX-XXXX";
      expiryCountdown.classList.add("expired");
      expiryCountdown.textContent = "Voucher expired";
      statusText.textContent = "Generate a new voucher.";
      setActiveUi(false);
      return;
    }

    expiryCountdown.classList.remove("expired");
    expiryCountdown.textContent = "Expires in: " + formatRemaining(remaining);
    setActiveUi(true);
  }

  function startTimer(){
    clearTimer();
    updateCountdown();
    timer = setInterval(updateCountdown,1000);
  }

  function showVoucher(code,expiresAt,serverTime,message){
    setServerTime(serverTime);
    localStorage.setItem(VOUCHER_KEY,code);
    localStorage.setItem(EXPIRES_KEY,String(expiresAt));
    voucherBox.textContent = code;
    statusText.textContent = message || "Voucher ready.";
    setActiveUi(true);
    startTimer();
  }

  function localVoucherIsActive(){
    var code = localStorage.getItem(VOUCHER_KEY);
    var expires = Number(localStorage.getItem(EXPIRES_KEY)||0);
    return !!(code && expires && expires > serverNow());
  }

  async function restoreFromServer(){
    statusText.classList.remove("copied");

    try{
      var r = await fetch("/api/voucher-generator-status",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({generatorId:generatorId()})
      });

      var data = await r.json().catch(function(){return {};});

      if(!r.ok || !data.ok){
        throw new Error(data.error || "STATUS_FAILED");
      }

      setServerTime(Number(data.serverTime));

      if(data.active && data.voucher && Number(data.expiresAt) > Number(data.serverTime)){
        showVoucher(
          data.voucher,
          Number(data.expiresAt),
          Number(data.serverTime),
          "Your active voucher was restored."
        );
        return true;
      }

      // Server says there is no active voucher for this generator.
      clearSavedVoucher();
      voucherBox.textContent = "XXXX-XXXX-XXXX";
      expiryCountdown.hidden = true;
      statusText.textContent = "No active voucher. You can generate one.";
      setActiveUi(false);
      return false;
    }catch(e){
      // Offline/backend failure: preserve a still-active locally saved voucher.
      if(localVoucherIsActive()){
        voucherBox.textContent = localStorage.getItem(VOUCHER_KEY);
        statusText.textContent = "Your active voucher is saved on this device.";
        setActiveUi(true);
        startTimer();
        return true;
      }

      statusText.textContent = "Unable to check voucher status. Please try again.";
      setActiveUi(false);
      return false;
    }
  }

  async function generate(){
    // Hard client-side guard against double generation while a saved voucher is active.
    if(localVoucherIsActive()){
      voucherBox.textContent = localStorage.getItem(VOUCHER_KEY);
      statusText.textContent = "You already have an active voucher.";
      setActiveUi(true);
      startTimer();
      return;
    }

    generateBtn.disabled = true;
    statusText.classList.remove("copied");
    statusText.textContent = "Generating...";

    try{
      var r = await fetch("/api/voucher-generate",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({generatorId:generatorId()})
      });

      var data = await r.json().catch(function(){return {};});

      if(!r.ok || !data.ok){
        throw new Error(data.error || "GENERATION_FAILED");
      }

      showVoucher(
        data.voucher,
        Number(data.expiresAt),
        Number(data.serverTime),
        data.existing ? "Your existing active voucher was restored." : "Voucher generated successfully."
      );
    }catch(e){
      statusText.textContent = "Unable to generate voucher. Please try again.";
      setActiveUi(false);
    }
  }

  async function copy(){
    var code = localStorage.getItem(VOUCHER_KEY);
    if(!code || !localVoucherIsActive()) return;

    try{
      await navigator.clipboard.writeText(code);
    }catch(e){
      var t=document.createElement("textarea");
      t.value=code;
      t.style.position="fixed";
      t.style.opacity="0";
      document.body.appendChild(t);
      t.select();
      try{document.execCommand("copy");}catch(ignore){}
      t.remove();
    }

    statusText.textContent="Voucher copied.";
    statusText.classList.add("copied");
    setTimeout(function(){
      statusText.classList.remove("copied");
      if(localVoucherIsActive()){
        statusText.textContent="Voucher ready to redeem in Bidamax.";
      }
    },1600);
  }

  generateBtn.addEventListener("click",generate);
  copyBtn.addEventListener("click",copy);

  // Instant local restore so refresh does not visually clear the voucher.
  if(localVoucherIsActive()){
    voucherBox.textContent = localStorage.getItem(VOUCHER_KEY);
    statusText.textContent = "Restoring your active voucher...";
    setActiveUi(true);
    startTimer();
  }else{
    setActiveUi(false);
  }

  // Then verify/restore against the GitHub-backed server state.
  restoreFromServer();
})();