# WebBLE Terminal — HM-10 / STM32WB55 / STM32WBA65

브라우저에서 BLE 장치와 문자열을 주고받는 정적 웹사이트입니다.
별도 서버 프로그램, 데이터베이스, npm 빌드 없이 HTML/CSS/JavaScript 파일로 실행합니다.

## 화면

| 경로 | 용도 |
| --- | --- |
| `/` | HM-10 UART 터미널 |
| `/wb55/` | WeAct STM32WB55 터미널 및 LED 제어 |
| `/wba65/` | WeAct STM32WBA65 PC13 LED 제어 |

GitHub Pages의 프로젝트 사이트에서는 위 경로 앞에 저장소명이 붙습니다.

## 사용 조건

- HTTPS와 Web Bluetooth를 지원하는 브라우저가 필요합니다. 로컬 개발에는 localhost를 사용할 수 있습니다.
- Windows/Android에서는 지원되는 Chrome, iPhone에서는 Bluefy로 접속합니다.
- 웹사이트는 화면과 코드를 제공하며, BLE 통신은 접속한 기기와 주변 보드 사이에서 이루어집니다.
- 연결 버튼을 누른 뒤 장치 선택 창에서 사용할 보드를 선택합니다.

## WB55 사용법

보드에는 FFE0/FFE1 서비스를 구현한 펌웨어가 필요합니다.
이 웹사이트 저장소에는 STM32 펌웨어나 CPU2 무선 스택이 포함되어 있지 않습니다.
함께 개발한 `WB55_BLE_Minimal` 펌웨어를 사용할 수 있습니다.

1. 보드 전원을 켜거나 리셋합니다. 해당 펌웨어의 광고 제한 시간인 60초 안에 연결합니다.
2. `/wb55/` 화면의 **WeAct 연결**을 누르고 보드를 선택합니다.
3. **LED ON / LED OFF** 버튼으로 PE4 LED를 제어합니다.
4. 문자열을 전송하고 RX에 같은 문자열이 돌아오는지 확인합니다.

| 항목 | 값 |
| --- | --- |
| Service UUID | `0000ffe0-0000-1000-8000-00805f9b34fb` |
| Characteristic UUID | `0000ffe1-0000-1000-8000-00805f9b34fb` |
| 특성 | Write / Write Without Response / Notify |
| LED 명령 | `LED_ON`, `LED_OFF` |
| 전송 단위 | 최대 20바이트씩 분할 |

LED 명령은 한 번의 BLE 쓰기에 들어가야 합니다. 일반 문자열은 여러 알림으로 나뉘어 표시될 수 있습니다.
에코는 받은 문자열의 반환이며 실제 LED 상태 조회 응답은 아닙니다.

## WBA65 사용법

WeAct STM32WBA65CIU6 보드에 함께 만든 `WBA65_WebBLE` 펌웨어를 다운로드합니다.

1. 보드를 켜거나 리셋합니다.
2. `/wba65/` 화면에서 **WBA65 연결**을 누릅니다.
3. 장치 목록에서 `WBA65xx`를 선택합니다.
4. **LED ON / LED OFF** 버튼으로 PC13 LED를 제어합니다.

| 항목 | 값 |
| --- | --- |
| Service UUID | `0000FE40-CC7A-482A-984A-7F2ED5B3E58F` |
| LED characteristic | `0000FE41-8E22-4541-9D4C-21EDAE82ED19` |
| Button characteristic | `0000FE42-8E22-4541-9D4C-21EDAE82ED19` |
| LED ON | `01 01` |
| LED OFF | `01 00` |

## GitHub Pages 배포

1. 이 폴더의 내용을 GitHub 저장소의 루트에 올립니다.
2. 저장소의 **Settings → Pages**를 엽니다.
3. **Build and deployment → Source → Deploy from a branch**를 선택합니다.
4. **main / (root)**를 선택하고 저장합니다.
5. 배포 완료 후 표시되는 HTTPS 주소로 접속합니다.

주소 예시:

```text
https://<account>.github.io/<repository>/
https://<account>.github.io/<repository>/wb55/
https://<account>.github.io/<repository>/wba65/
```

## 파일 구성

```text
index.html       HM-10 화면
app.js           HM-10 BLE 처리
styles.css       HM-10 스타일
wb55/index.html  WB55 화면 및 스타일
wb55/app.js      WB55 BLE 처리와 LED 명령
wba65/index.html WBA65 LED 제어 화면
wba65/app.js     WBA65 FE40/FE41/FE42 BLE 처리
.nojekyll        정적 파일을 그대로 제공하도록 지정
```

연결 실패 시 HTTPS, 브라우저 BLE 지원, 보드의 광고 상태, 다른 앱의 연결 여부를 확인하세요.
