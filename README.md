***Simply run this browser extension and it will scan pages for misinformation on initial load***

**RAG-LLM based fact-checking for medically factual browsing**

*Backend:*

Python + FastAPI + Huggingface + Flashrank <br>
(RAG knowledge base sourced from MayoClinic) <br>
LLM Model: *Qwen/Qwen3-4B-Instruct-2507* <br>
Embedding Model: *BAAI/bge-small-en-v1.5* <br>

*Frontend:*

Javascript Chrome Extension

**Future Plans**
- Currently only runs on page load, which may not capture information populated after loading (e.g. Twitter). We will expand user controls in the future.
- Extend RAG knowledge-base with more documents involving nutrition and other medical conspiracies.
- Support for video websites through transcripts or captions.
- Live updates in response to page updates. 

![alt text](images/adhd.png)

![alt text](images/menstrual.png)