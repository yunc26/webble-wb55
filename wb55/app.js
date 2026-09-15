"use strict";
const SERVICE = "0000ffe0-0000-1000-8000-00805f9b34fb";
const CHARACTERISTIC = "0000ffe1-0000-1000-8000-00805f9b34fb";
const el = Object.fromEntries(["connect", "disconnect", "on", "off", "clear", "sendForm", "message", "send", "ending", "terminal", "status", "notice"].map(id => [id, document.getElementById(id)]));
let device = null, characteristic = null, connecting = false, sending = false;
let decoder = new TextDecoder("utf-8");
const encoder = new TextEncoder();
function updateUi() {
  const connected = Boolean(device?.gatt?.connected && characteristic);
  el.connect.disabled = connecting || connected;
  el.disconnect.disabled = !connected;
  for (const key of ["on", "off", "send", "message"]) el[key].disabled = !connected || sending;
}
function log(direction, text) {
  const row = document.createElement("div");
  row.textContent = `${new Date().toLocaleTimeString()}  ${direction}  ${text}`;
  el.terminal.append(row);
  while (el.terminal.children.length > 500) el.terminal.firstElementChild.remove();
  el.terminal.scrollTop = el.terminal.scrollHeight;
}
function notify(event) {
  const text = decoder.decode(event.target.value, { stream: true });
  if (text) log("RX", text);
}
function disconnected(event) {
  if (event && event.target !== device) return;
  characteristic?.removeEventListener("characteristicvaluechanged", notify);
  characteristic = null;
  decoder = new TextDecoder("utf-8");
  el.status.textContent = "연결 안 됨";
  el.notice.textContent = "연결이 해제되었습니다. 필요하면 보드를 리셋하고 다시 연결하세요.";
  updateUi();
  log("SYS", "연결 해제");
}
el.connect.addEventListener("click", async () => {
  if (!navigator.bluetooth || !window.isSecureContext) {
    el.notice.textContent = "Web Bluetooth를 지원하는 Chrome/Edge에서 HTTPS 주소로 열어 주세요.";
    return;
  }
  connecting = true;
  updateUi();
  el.status.textContent = "연결 중";
  try {
    device?.removeEventListener("gattserverdisconnected", disconnected);
    device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: [SERVICE] });
    device.addEventListener("gattserverdisconnected", disconnected);
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(SERVICE);
    characteristic = await service.getCharacteristic(CHARACTERISTIC);
    characteristic.addEventListener("characteristicvaluechanged", notify);
    await characteristic.startNotifications();
    el.status.textContent = `${device.name || "이름 없는 BLE 장치"} 연결됨`;
    el.notice.textContent = "LED 버튼 또는 문자열 전송으로 테스트하세요.";
    log("SYS", el.status.textContent);
  } catch (error) {
    if (device?.gatt?.connected) device.gatt.disconnect();
    characteristic?.removeEventListener("characteristicvaluechanged", notify);
    characteristic = null;
    el.status.textContent = "연결 실패";
    el.notice.textContent = error.name === "NotFoundError" ? "장치 선택이 취소되었습니다. 리셋 후 WeAct를 선택하세요." : error.message;
  } finally {
    connecting = false;
    updateUi();
  }
});
async function send(text) {
  if (sending || !characteristic || !device?.gatt?.connected) return;
  const target = characteristic;
  sending = true;
  updateUi();
  try {
    const bytes = encoder.encode(text);
    for (let offset = 0; offset < bytes.length; offset += 20) {
      if (target !== characteristic || !device?.gatt?.connected) throw new Error("연결이 해제되었습니다.");
      const chunk = bytes.slice(offset, offset + 20);
      if (target.properties.writeWithoutResponse) await target.writeValueWithoutResponse(chunk);
      else if (target.properties.write) await target.writeValueWithResponse(chunk);
      else throw new Error("이 특성은 쓰기를 지원하지 않습니다.");
      if (offset + 20 < bytes.length) await new Promise(resolve => setTimeout(resolve, 20));
    }
    log("TX", text);
    el.notice.textContent = "전송 완료. RX 에코와 보드 LED를 확인하세요.";
    return true;
  } catch (error) {
    el.notice.textContent = `전송 실패: ${error.message}`;
    return false;
  } finally {
    sending = false;
    updateUi();
  }
}
el.disconnect.addEventListener("click", () => device?.gatt?.disconnect());
el.on.addEventListener("click", () => send("LED_ON"));
el.off.addEventListener("click", () => send("LED_OFF"));
el.clear.addEventListener("click", () => el.terminal.replaceChildren());
el.sendForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (!el.message.value) return;
  const ending = el.ending.value === "crlf" ? "\r\n" : el.ending.value === "lf" ? "\n" : "";
  if (await send(el.message.value + ending)) el.message.value = "";
});
window.addEventListener("beforeunload", () => device?.gatt?.disconnect());
updateUi();
