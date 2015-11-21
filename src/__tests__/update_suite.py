import os
import urllib
import re
import json
import sys

SPREADSHEET_URL = 'https://spreadsheets.google.com/feeds/list/0AjzMl1BJlJDkdDI2c0VUSHNZMnR6ZVR5S2hXZEdtd1E/1/public/basic?alt=json'

SUITE_PATH = os.path.join(os.path.dirname(__file__), 'suite')

data = json.load(urllib.urlopen(SPREADSHEET_URL))

if not os.path.exists(SUITE_PATH):
    os.makedirs(SUITE_PATH)

new_data = []
for index, entry in enumerate(data['feed']['entry']):
    row = entry['content']['$t']
    chunks = re.split(r'expr\:|, local\: |, server\: |, firstdifference\: |, reason\: |, desugar\: |, bytecode\: |, pyret\: |, pyretast\: ', row)

    while len(chunks) < 10:
        chunks.append('')

    new_data.append(dict(
        expr = re.sub(r'^\s+', '', chunks[1]),
        local = chunks[2],
        server = chunks[3],
        difference = chunks[4],
        reason = chunks[5],
        desugar = chunks[6],
        bytecode = chunks[7],
        pyretSrc = chunks[8],
        pyretAST = chunks[9],
    ))

with open(os.path.join(os.path.dirname(__file__), 'suite.json'), 'w') as f:
    json.dump(new_data, f)
