#!/usr/bin/env python3
"""Destructive-to-test-data-only endpoint validation.
DO NOT run against practice DB. Requires fictional practice/admin, claim, invoice,
receipt, advice, match already created through the test API (port 8081).
Requires environment TEST_AUTH_COOKIE and TEST_MATCH_ID. Posting flag must be on in TEST API only.
"""
import concurrent.futures
import json
import os
import sys
import urllib.error
import urllib.request
import uuid
from decimal import Decimal

BASE = os.getenv('TEST_API_BASE', 'http://127.0.0.1:8081').rstrip('/')
MATCH_ID = os.getenv('TEST_MATCH_ID')
COOKIE = os.getenv('TEST_AUTH_COOKIE')
if BASE != 'http://127.0.0.1:8081':
    sys.exit('REFUSING: test runner only allows http://127.0.0.1:8081')
if not COOKIE or not MATCH_ID:
    sys.exit('Set TEST_AUTH_COOKIE and TEST_MATCH_ID for isolated fictional test records.')
try: uuid.UUID(MATCH_ID)
except ValueError: sys.exit('TEST_MATCH_ID is not a UUID')

def call(method, path, payload=None):
    url = BASE + '/api/finance/medical-aid/invoice-settlement' + path
    headers = {'Cookie': COOKIE, 'Accept': 'application/json'}
    data = None
    if payload is not None:
        data = json.dumps(payload).encode()
        headers['Content-Type'] = 'application/json'
        headers['X-Requested-With'] = 'XMLHttpRequest'
    request = urllib.request.Request(url, method=method, data=data, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return response.status, json.loads(response.read())
    except urllib.error.HTTPError as e:
        raw = e.read()
        try: return e.code, json.loads(raw)
        except ValueError: return e.code, {'error': raw[:500].decode(errors='replace')}

def expect(cond, msg):
    if not cond: sys.exit('FAIL: ' + msg)
    print('PASS:', msg)

code, caps = call('GET', '/capabilities')
expect(code == 200, f'authenticated capabilities HTTP 200 (received {code})')
expect(caps.get('postingEnabled') is True, 'posting enabled on isolated test API')
code, before = call('GET', '/preview/' + MATCH_ID)
expect(code == 200, f'fictional match preview HTTP 200 (received {code})')
amount = Decimal(str(before.get('maxAllocatable', '0')))
expect(amount > 0, 'fictional match has positive allocatable amount')
amount_text = str(amount.quantize(Decimal('0.01')))
print('ISOLATED TEST: fictional match maximum', amount_text)

# A rejected over-allocation must not modify records.
code, _ = call('POST', '/allocations', {
    'requestId': str(uuid.uuid4()), 'remittanceMatchId': MATCH_ID,
    'amount': float(amount + Decimal('.01')),
    'evidenceReference': 'TEST-ONLY-OVERPAYMENT', 'notes': 'Expected rejection',
})
expect(code == 409, f'over-allocation rejected with 409 (received {code})')

# Distinct request IDs each attempt to spend the entire matched balance at once.
requests = [
    {'requestId': str(uuid.uuid4()), 'remittanceMatchId': MATCH_ID,
     'amount': float(amount), 'evidenceReference': f'TEST-ONLY-CONCURRENT-{i}',
     'notes': 'Isolated fictional database test'}
    for i in (1, 2)
]
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    results = list(pool.map(lambda req: call('POST', '/allocations', req), requests))
print('Concurrent HTTP statuses:', [r[0] for r in results])
created = [(i, r[1]) for i, r in enumerate(results) if r[0] == 201]
expect(len(created) == 1, 'exactly one concurrent full-allocation request succeeded')
expect(sorted(r[0] for r in results) == [201, 409], 'other request received controlled 409')
index, allocation = created[0]
allocation_id = allocation.get('id') or allocation.get('Id')
expect(bool(allocation_id), 'created allocation returned an ID')

# Exact same request must return alreadyPosted and avoid creating another allocation.
code, duplicate = call('POST', '/allocations', requests[index])
expect(code == 200 and duplicate.get('alreadyPosted') is True, 'idempotent replay')

# Reversal is append-only and must restore available funds.
code, reversal = call('POST', f'/allocations/{allocation_id}/reverse', {
    'reason': 'Isolated fictional settlement integration test',
})
expect(code == 201, f'first reversal succeeds (received {code})')
code, _ = call('POST', f'/allocations/{allocation_id}/reverse', {
    'reason': 'Second reversal must be rejected',
})
expect(code == 409, f'second reversal rejected (received {code})')
code, after = call('GET', '/preview/' + MATCH_ID)
expect(code == 200, 'preview accessible after reversal')
expect(Decimal(str(after.get('maxAllocatable'))) == amount,
       'reversal restores original maximum allocatable amount')
code, history = call('GET', '/allocations?matchId=' + MATCH_ID)
expect(code == 200 and any(x['id'] == allocation_id and x['isReversed'] for x in history),
       'allocation retained and marked reversed in history')
print('ALL ISOLATED TESTS PASSED. Confirm audit trail and practice database unchanged separately.')
