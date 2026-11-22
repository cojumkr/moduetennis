# MTC v104 — 출석 코인 예외 지급

- v103 기능 유지.
- 수요일 사전 투표 마감 기준을 충족하지 않은 회원에게도 운영진이 `⚙️ 예외 지급 +1` 버튼으로 지급 가능.
- 해당 날짜에 참가 신청되어 있고 실제 출석이 확정된 정회원만 허용.
- 지급 사유 입력 및 최종 확인 필수.
- 날짜·회원별 중복 출석 코인 지급 차단. 기존 지급 취소 가능.
- ledger에 `type: attendance_bonus`, `exception: true`, `reason` 저장; attendanceAudit에도 기록.
- 예외 지급 시 출석 원본을 재저장하지 않도록 `save({preserveAttendance:true})` 사용.
- Firebase 실환경 테스트는 별도로 필요. 적용 전 백업 필수.
