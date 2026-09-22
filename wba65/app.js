"use strict";

const SERVICE_UUID = "0000fe40-cc7a-482a-984a-7f2ed5b3e58f";
const LED_UUID = "0000fe41-8e22-4541-9d4c-21edae82ed19";
const BUTTON_UUID = "0000fe42-8e22-4541-9d4c-21edae82ed19";

const el = Object.fromEntries(
  ["connect", "disconnect", "on", "off", "clear", "status", "status-dot", "notice", "terminal"]
    .map((id) => [id, document.getElementById(id)]),
);

let device = null;
let ledCharacteristic = null;
let buttonCharacteristic = null;
let connecting = false;
let writing = false;

function connected() {
  return Boolean(device?.gatt?.connected && ledCharacteristic);
}

function updateUi() {
  const online = connected();
  el.connect.disabled = connecting || online;
  el.disconnect.disabled = !online;
  el.on.disabled = !online || writing;
  el.off.disabled = !online || writing;
  el["status-dot"].className = `dot ${online ? "online" : connecting ? "connecting" : ""}`;
}

function log(direction, message) {
  const row = document.createElement("div");
  const time = new Date().toLocaleTimeString();
  row.textContent = `${time}  ${direction.padEnd(3)}  ${message}`;
  el.terminal.append(row);
  while (el.terminal.children.length > 200) el.terminal.firstElementChild.remove();
  el.terminal.scrollTop = el.terminal.scrollHeight;
}

function onButtonNotification(event) {
  const value = event.target.value;
  const data = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  const hex = [...data].map((byte) => byte.toString(16).padStart(2, "0")).join(" ");
  const state = data.length >= 2 ? (data[1] ? "눌림/ON" : "해제/OFF") : "알 수 없음";
  log("RX", `${hex}  버튼 상태: ${state}`);
}

function onDisconnected(event) {
  if (event && event.target !== device) return;
  buttonCharacteristic?.removeEventListener("characteristicvaluechanged", onButtonNotification);
  ledCharacteristic = null;
  buttonCharacteristic = null;
  el.status.textContent = "연결 안 됨";
  el.notice.textContent = "연결이 해제되었습니다. 다시 연결할 수 있습니다.";
  updateUi();
  log("SYS", "연결 해제");
}

el.connect.addEventListener("click", async () => {
  if (!navigator.bluetooth) {
    el.notice.textContent = "Web Bluetooth를 지원하는 Chrome 또는 Edge가 필요합니다.";
    return;
  }
  if (!window.isSecureContext) {
    el.notice.textContent = "이 페이지를 HTTPS 또는 http://localhost 주소로 여세요.";
    return;
  }

  connecting = true;
  el.status.textContent = "연결 중";
  updateUi();

  try {
    device?.removeEventListener("gattserverdisconnected", onDisconnected);
    device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [SERVICE_UUID],
    });
    device.addEventListener("gattserverdisconnected", onDisconnected);

    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(SERVICE_UUID);
    ledCharacteristic = await service.getCharacteristic(LED_UUID);

    try {
      buttonCharacteristic = await service.getCharacteristic(BUTTON_UUID);
      buttonCharacteristic.addEventListener("characteristicvaluechanged", onButtonNotification);
      await buttonCharacteristic.startNotifications();
    } catch (error) {
      buttonCharacteristic = null;
      log("SYS", `버튼 알림 사용 불가: ${error.message}`);
    }

    el.status.textContent = `${device.name || "WBA65"} 연결됨`;
    el.notice.textContent = "연결되었습니다. LED ON/OFF를 눌러 보세요.";
    log("SYS", el.status.textContent);
  } catch (error) {
    if (device?.gatt?.connected) device.gatt.disconnect();
    ledCharacteristic = null;
    buttonCharacteristic = null;
    el.status.textContent = "연결 실패";
    el.notice.textContent = error.name === "NotFoundError"
      ? "장치 선택이 취소되었습니다. WBA65xx 장치를 선택하세요."
      : `연결 실패: ${error.message}`;
    log("ERR", el.notice.textContent);
  } finally {
    connecting = false;
    updateUi();
  }
});

async function setLed(on) {
  if (!connected() || writing) return;
  writing = true;
  updateUi();
  const command = new Uint8Array([0x01, on ? 0x01 : 0x00]);

  try {
    if (ledCharacteristic.properties.writeWithoutResponse) {
      await ledCharacteristic.writeValueWithoutResponse(command);
    } else {
      await ledCharacteristic.writeValueWithResponse(command);
    }
    log("TX", `${on ? "01 01" : "01 00"}  LED ${on ? "ON" : "OFF"}`);
    el.notice.textContent = `LED ${on ? "ON" : "OFF"} 명령을 전송했습니다.`;
  } catch (error) {
    el.notice.textContent = `전송 실패: ${error.message}`;
    log("ERR", el.notice.textContent);
  } finally {
    writing = false;
    updateUi();
  }
}

el.disconnect.addEventListener("click", () => device?.gatt?.disconnect());
el.on.addEventListener("click", () => setLed(true));
el.off.addEventListener("click", () => setLed(false));
el.clear.addEventListener("click", () => el.terminal.replaceChildren());
window.addEventListener("beforeunload", () => device?.gatt?.disconnect());
updateUi();
