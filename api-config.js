// 同源後端或本機分離部署；部署時只修改此處，不從 URL 讀取 API 主機。
window.NTOU_API_BASE = ['8000',''].includes(location.port) ? '/api' : 'http://127.0.0.1:8000/api';
