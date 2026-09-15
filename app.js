const HM10_SERVICE_UUID = "0000ffe0-0000-1000-8000-00805f9b34fb";
const HM10_CHARACTERISTIC_UUID = "0000ffe1-0000-1000-8000-00805f9b34fb";
const BLE_CHUNK_SIZE = 20;
const MAX_LOG_ENTRIES = 500;

const elements = {
  connectButton: document.querySelector("#connectButton"),
  disconnectButton: document.querySelector("#disconnectButton"),
  clearButton: document.querySelector("#clearButton"),
  sendButton: document.querySelector("#sendButton"),
  sendForm: document.querySelector("#sendForm"),
  messageInput: document.querySelector("#messageInput"),
  lineEnding: document.querySelector("#lineEnding"),
  terminal: document.querySelector("#terminal"),
  emptyState: document.querySelector("#emptyState"),
  autoScroll: document.querySelector("#autoScroll"),
  statusDot: document.querySelector("#statusDot"),
  statusText: document.querySelector("#statusText"),
  deviceName: document.querySelector("#deviceName"),
  notice: document.querySelector("#notice"),
};

let bluetoothDevice = null;
let uartCharacteristic = null;
let isConnecting = false;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8");

function setStatus(state, text) {
  elements.statusDot.className = "status-dot " + state;
  elements.statusText.textContent = text;
}

function setConnectedUi(connected) {
  elements.connectButton.disabled = connected || isConnecting;
  elements.disconnectButton.disabled = !connected;
  elements.messageInput.disabled = !connected;
  elements.sendButton.disabled = !connected;

  if (connected) {
    elements.messageInput.focus();
  }
}

function setNotice(message, kind = "info") {
  elements.notice.textContent = message;
  elements.notice.dataset.kind = kind;
}

function formatTime(date = new Date()) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function appendLog(direction, payloadText) {
  elements.emptyState?.remove();

  const row = document.createElement("div");
  row.className = "log-row " + direction.toLowerCase();

  const meta = document.createElement("div");
  meta.className = "log-meta";

  const badge = document.createElement("span");
  badge.className = "direction-badge";
  badge.textContent = direction;

  const time = document.createElement("time");
  time.dateTime = new Date().toISOString();
  time.textContent = formatTime();

  const payload = document.createElement("pre");
  payload.textContent = payloadText;

  meta.append(badge, time);
  row.append(meta, payload);
  elements.terminal.append(row);

  while (elements.terminal.children.length > MAX_LOG_ENTRIES) {
    elements.terminal.firstElementChild?.remove();
  }

  if (elements.autoScroll.checked) {
    elements.terminal.scrollTop = elements.terminal.scrollHeight;
  }
}

function appendSystemLog(message) {
  appendLog("SYS", message);
}

function lineEndingValue() {
  switch (elements.lineEnding.value) {
    case "lf":
      return "\n";
    case "crlf":
      return "\r\n";
    default:
      return "";
  }
}

function sleep(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function writeChunk(chunk) {
  if (uartCharacteristic.properties.writeWithoutResponse) {
    await uartCharacteristic.writeValueWithoutResponse(chunk);
    return;
  }

  if (uartCharacteristic.properties.write) {
    await uartCharacteristic.writeValueWithResponse(chunk);
    return;
  }

  throw new Error("FFE1 특성이 쓰기 기능을 지원하지 않습니다.");
}

async function sendText(text) {
  if (!uartCharacteristic || !bluetoothDevice?.gatt?.connected) {
    throw new Error("HM-10이 연결되어 있지 않습니다.");
  }

  const bytes = textEncoder.encode(text);

  for (let offset = 0; offset < bytes.length; offset += BLE_CHUNK_SIZE) {
    const chunk = bytes.slice(offset, offset + BLE_CHUNK_SIZE);
    await writeChunk(chunk);

    // HM-10 and some clones can lose back-to-back writes without a pause.
    if (offset + BLE_CHUNK_SIZE < bytes.length) {
      await sleep(20);
    }
  }
}

function handleNotification(event) {
  const value = event.target.value;
  const bytes = new Uint8Array(
    value.buffer,
    value.byteOffset,
    value.byteLength,
  );
  const receivedText = textDecoder.decode(bytes, { stream: true });

  if (receivedText.length > 0) {
    appendLog("RX", receivedText);
  }
}

function handleDisconnected() {
  uartCharacteristic?.removeEventListener(
    "characteristicvaluechanged",
    handleNotification,
  );
  uartCharacteristic = null;
  setConnectedUi(false);
  setStatus("offline", "연결 안 됨");
  setNotice("HM-10 연결이 해제되었습니다.", "warning");
  appendSystemLog("HM-10 연결 해제");
}

async function connect() {
  if (!navigator.bluetooth) {
    setNotice(
      "이 브라우저는 Web Bluetooth를 지원하지 않습니다. Chrome 또는 Edge를 사용하세요.",
      "error",
    );
    return;
  }

  if (!window.isSecureContext) {
    setNotice(
      "Web Bluetooth 사용을 위해 HTTPS 또는 localhost로 페이지를 열어야 합니다.",
      "error",
    );
    return;
  }

  isConnecting = true;
  setConnectedUi(false);
  elements.connectButton.disabled = true;
  setStatus("connecting", "연결 중");
  setNotice("Bluetooth 장치 목록에서 HM-10을 선택하세요.");

  try {
    bluetoothDevice = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [HM10_SERVICE_UUID],
    });

    bluetoothDevice.addEventListener(
      "gattserverdisconnected",
      handleDisconnected,
    );

    elements.deviceName.textContent =
      bluetoothDevice.name || "이름 없는 BLE 장치";

    const server = await bluetoothDevice.gatt.connect();
    const service = await server.getPrimaryService(HM10_SERVICE_UUID);
    uartCharacteristic = await service.getCharacteristic(
      HM10_CHARACTERISTIC_UUID,
    );

    uartCharacteristic.addEventListener(
      "characteristicvaluechanged",
      handleNotification,
    );
    await uartCharacteristic.startNotifications();

    setStatus("online", "연결됨");
    setConnectedUi(true);
    setNotice("FFE1 알림 수신이 시작되었습니다.", "success");
    appendSystemLog(elements.deviceName.textContent + " 연결 완료");
  } catch (error) {
    console.error(error);
    uartCharacteristic = null;

    if (bluetoothDevice?.gatt?.connected) {
      bluetoothDevice.gatt.disconnect();
    }

    setStatus("offline", "연결 실패");
    setConnectedUi(false);

    const message =
      error.name === "NotFoundError"
        ? "장치 선택이 취소되었거나 HM-10을 찾지 못했습니다."
        : "연결 실패: " + error.message;
    setNotice(message, "error");
  } finally {
    isConnecting = false;
    elements.connectButton.disabled = Boolean(
      bluetoothDevice?.gatt?.connected,
    );
  }
}

function disconnect() {
  if (bluetoothDevice?.gatt?.connected) {
    bluetoothDevice.gatt.disconnect();
  }
}

async function handleSend(event) {
  event.preventDefault();

  const message = elements.messageInput.value;
  if (message.length === 0) {
    return;
  }

  const completeMessage = message + lineEndingValue();
  elements.sendButton.disabled = true;

  try {
    await sendText(completeMessage);
    appendLog("TX", completeMessage);
    elements.messageInput.value = "";
    setNotice(
      textEncoder.encode(completeMessage).length + "바이트 전송 완료",
      "success",
    );
  } catch (error) {
    console.error(error);
    setNotice("전송 실패: " + error.message, "error");
  } finally {
    elements.sendButton.disabled = !bluetoothDevice?.gatt?.connected;
    elements.messageInput.focus();
  }
}

function clearTerminal() {
  elements.terminal.replaceChildren();

  const empty = document.createElement("div");
  empty.id = "emptyState";
  empty.className = "empty-state";

  const symbol = document.createElement("span");
  symbol.className = "prompt-symbol";
  symbol.textContent = ">_";

  const message = document.createElement("p");
  message.textContent = "새 송수신 데이터가 여기에 표시됩니다.";

  empty.append(symbol, message);
  elements.terminal.append(empty);
  elements.emptyState = empty;
}

elements.connectButton.addEventListener("click", connect);
elements.disconnectButton.addEventListener("click", disconnect);
elements.clearButton.addEventListener("click", clearTerminal);
elements.sendForm.addEventListener("submit", handleSend);
elements.messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    elements.sendForm.requestSubmit();
  }
});

window.addEventListener("beforeunload", () => {
  if (bluetoothDevice?.gatt?.connected) {
    bluetoothDevice.gatt.disconnect();
  }
});

setConnectedUi(false);

if (!navigator.bluetooth) {
  setNotice(
    "Web Bluetooth 미지원 브라우저입니다. Chrome 또는 Edge에서 여세요.",
    "error",
  );
} else if (!window.isSecureContext) {
  setNotice(
    "HTTPS 또는 localhost 주소로 열어야 Bluetooth 연결 버튼이 동작합니다.",
    "warning",
  );
}
