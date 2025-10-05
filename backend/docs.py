import os
from pathlib import Path
import json
import torch
from transformers import AutoModel, AutoTokenizer

PROJECT_PATH = os.path.join(os.path.dirname(__file__))
DOCS_PATH = os.path.join(PROJECT_PATH, "docs")
DATA_PATH = os.path.join(PROJECT_PATH, "data")

EMBEDDING_MODEL_PATH = os.path.join(PROJECT_PATH, "models", "embedding_model")
EMBEDDING_MODEL_NAME = "BAAI/bge-small-en-v1.5"  # Example of a sentence embedding model

output_file = os.path.join(DATA_PATH, "embedded_docs.json")

docs = []

def read_txt_files():
	script_dir = Path(DOCS_PATH).parent
	folder_path = script_dir / DOCS_PATH
	
	# Check if folder exists
	if not folder_path.exists():
		print(f"Error: Folder '{DOCS_PATH}' not found")
		return []
	
	# Read all .txt files
	for file_path in folder_path.glob("*.txt"):
		try:
			with open(file_path, 'r', encoding='utf-8') as f:
				content = f.read()
				docs.append({
					'source': content.split()[0],
					'text': content
				})
				print(f"Read: {file_path.name}")
		except Exception as e:
			print(f"Error reading {file_path.name}: {e}")

def load_generator():
	embedding_model_dir = Path(EMBEDDING_MODEL_PATH)
	# Check if local model exists
	if embedding_model_dir.exists():
		print(f"✅ Loading local model from {embedding_model_dir}")
		tokenizer = AutoTokenizer.from_pretrained(embedding_model_dir)
		model = AutoModel.from_pretrained(embedding_model_dir)
	else:
		print(f"⬇️ Downloading {EMBEDDING_MODEL_PATH} from Hugging Face...")
		tokenizer = AutoTokenizer.from_pretrained(EMBEDDING_MODEL_NAME)
		model = AutoModel.from_pretrained(EMBEDDING_MODEL_NAME)

		# Save both tokenizer and model locally
		embedding_model_dir.mkdir(parents=True, exist_ok=True)
		tokenizer.save_pretrained(embedding_model_dir)
		model.save_pretrained(embedding_model_dir)
		print(f"💾 Model saved locally at {embedding_model_dir}")
	
	return tokenizer, model

def put_embeddings():
	tokenizer, model = load_generator()

	def get_embedding(inputs):
		with torch.no_grad():
			outputs = model(**inputs)

		# Mean pooling
		token_embeddings = outputs.last_hidden_state  # (batch_size, seq_len, hidden_size)
		attention_mask = inputs['attention_mask']

		input_mask_expanded = attention_mask.unsqueeze(-1).expand(token_embeddings.size()).float()
		sum_embeddings = torch.sum(token_embeddings * input_mask_expanded, dim=1)
		sum_mask = input_mask_expanded.sum(dim=1)
		mean_pooled = sum_embeddings / sum_mask

		return mean_pooled[0].tolist()  # Convert tensor to list
	  
	for doc in docs:
		inputs = tokenizer(doc['text'], return_tensors="pt", truncation=True, padding=True)
		embedding = get_embedding(inputs)

		doc["embedding"] = embedding

def save_to_json():
	with open(output_file, 'w', encoding="utf-8") as outfile:
		outfile.write(json.dumps(docs, ensure_ascii=False) + "\n")
			
			
def load_data():
	res = []
	  
	if not os.path.exists(output_file):
		print(f"Error: File '{output_file}' not found")
		return []
	
	with open(output_file, 'r', encoding='utf-8') as infile:
		res = json.load(infile)

	return res

read_txt_files()
put_embeddings()
save_to_json()

