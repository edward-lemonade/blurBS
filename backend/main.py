# backend/main.py
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import re
import json
from bs4 import BeautifulSoup
import asyncio

from llm import (generate_answer, load_generator)

print("Loading generator...")
gen_tok, gen_model = load_generator()
print("Generator loaded!")

app = FastAPI()
app.add_middleware(
	CORSMiddleware,
	allow_origins=["*"],
	allow_methods=["*"],
	allow_headers=["*"],
)

@app.post("/analyze")
async def analyze(request: Request):
	data = await request.json()
	html_content = data.get('html', '')
   
	soup = BeautifulSoup(html_content, 'html.parser')
	
	for element in soup(['script', 'style', 'noscript', 'meta', 'link', 'nav', 'header', 'footer', 'button', 'aside']):
		element.decompose()
	for element in soup.find_all(class_=['nav', 'navbar', 'menu', 'sidebar', 'footer', 'header', 'navigation']):
		element.decompose()
	
	text_set = set()
	content_elements = soup.find_all(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 
									  'li', 'td', 'th', 'blockquote', 'pre', 
									  'article', 'section'])
	
	for element in content_elements:
		text = element.get_text(strip=True)
		# Only add substantial text (at least 4 words)
		if text and len(text.split()) >= 10:
			text_set.add(text)
	
	# If no content elements found, fall back to divs and spans with substantial text
	if not text_set:
		for element in soup.find_all(['div', 'span']):
			text = element.get_text(strip=True)
			if text and len(text.split()) >= 10:
				text_set.add(text)

	text_array = sorted(list(text_set), key=lambda x: len(x), reverse=True)
	text = ('.'.join(text_array[:20]))[:1000]

	ans = await query(text)
	
	return {
		"findings": ans.get('findings', []),  # List of dicts - serializes fine!
		"metadata": {
			"url": data.get('url'),
			"corrections_count": len(ans.get('findings', []))
		}
	}

async def query(text):
	response = generate_answer(text, gen_tok, gen_model)
	print(response)
	
	# Strip excess characters until curly braces are reached
	start_idx = response.find('{')
	end_idx = response.rfind('}')
	
	if start_idx != -1 and end_idx != -1 and start_idx < end_idx:
		response = response[start_idx:end_idx + 1]
	
	result_json = json.loads(response)
	return result_json


#res = asyncio.run(query("Vaccines cause autism. Tylenol also causes autism. There are no ways to cure autism but plenty of ways to manage it."))
#print(res)

uvicorn.run(app, host="127.0.0.1", port=8000)
	 