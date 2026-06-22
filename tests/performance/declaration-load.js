import http from 'k6/http'
import { check, sleep } from 'k6'

export const options = {
  vus: 10,
  duration: '30s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
  },
}

export default function () {
  const payload = JSON.stringify({
    referenceNo: `TN-K6-${Date.now()}-${__VU}`,
    originCountry: 'VN',
    destinationCountry: 'IN',
    commodityCategory: 'electronics',
    declaredValue: 184000,
    previousViolation: false,
    documents: ['invoice', 'packing-list', 'origin-certificate'],
  })

  const response = http.post('http://localhost:8080/api/declarations', payload, {
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': `${Date.now()}-${__VU}-${__ITER}`,
    },
  })

  check(response, {
    accepted: (res) => res.status === 202,
  })
  sleep(1)
}
