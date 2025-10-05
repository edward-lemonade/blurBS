import numpy as np
from flashrank import Ranker, RerankRequest
import json
import os
import torch
import heapq
from transformers import AutoModel, AutoTokenizer, AutoModelForCausalLM, GenerationConfig
from sklearn.metrics.pairwise import cosine_similarity
from sentence_transformers import util #, SentenceTransformer

PROJECT_PATH = os.path.join(os.path.dirname(__file__))
DOC_FILE = os.path.join(PROJECT_PATH, "data", "embedded_docs.json")

EMBEDDING_MODEL_PATH = os.path.join(PROJECT_PATH, "models", "embedding_model")

TOP_K = 10
TOP_P = 3
SIMILARITY_THRESHOLD = 0.3  # Adjust this threshold as needed


def top_k(prompt, k):
	with open(DOC_FILE, 'r', encoding='utf-8') as f:
		model = AutoModel.from_pretrained(EMBEDDING_MODEL_PATH)
		tokenizer = AutoTokenizer.from_pretrained(EMBEDDING_MODEL_PATH)

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
		
		inputs = tokenizer(prompt, return_tensors="pt", truncation=True, padding=True)
		prompt_embedding = get_embedding(inputs)

		top_k_heap = []
		i = -1

		docs = json.loads(f.read())
		for doc in docs:
			i += 1
			try:
				text_embedding = doc["embedding"]
				similarity = util.pytorch_cos_sim(prompt_embedding, text_embedding).item()

				if (similarity > SIMILARITY_THRESHOLD) and (len(top_k_heap) < k):
					heapq.heappush(top_k_heap, (similarity, doc))
				else:
					heapq.heappushpop(top_k_heap, (similarity, doc))

			except json.JSONDecodeError:
				print(str(i) + ": JSON Decode Error")
				continue
		
		return top_k_heap
	return

def rerank(prompt, k=TOP_K, similarity_threshold=SIMILARITY_THRESHOLD): 
	ranker = Ranker(max_length=128)

	docs = top_k(prompt, k)
	if docs is None:
		print("[Error] No documents found")
		return []
	
	passages = [t[1] for t in docs]

	rerankrequest = RerankRequest(query=prompt, passages=passages)
	results = ranker.rerank(rerankrequest)

	# Filter results by similarity threshold
	filtered_results = [result for result in results[:TOP_P]]

	return filtered_results

#run()