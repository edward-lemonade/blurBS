from transformers import AutoModel, AutoTokenizer, AutoModelForCausalLM, GenerationConfig, BitsAndBytesConfig
import bitsandbytes
import torch
import os
from pathlib import Path
import time
import rag
import json

PROJECT_PATH = os.path.join(os.path.dirname(__file__))

GENERATOR_MODEL_PATH = os.path.join(PROJECT_PATH, "models", "generator_model")
GENERATOR_MODEL_NAME = "Qwen/Qwen3-4B-Instruct-2507"

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print("CUDA?", torch.cuda.is_available())

bnb_config = BitsAndBytesConfig(
	load_in_4bit=True,
	bnb_4bit_compute_dtype=torch.float16,
	bnb_4bit_use_double_quant=True,
	bnb_4bit_quant_type="nf4"
)

top_k = 3
docs_to_embed = 1000
batch_size = 8
max_query_length = 256
max_new_tokens = 100
temperature = 0.7
top_p = 0.9

def load_generator(quantized=True):
	generator_model_dir = Path(GENERATOR_MODEL_PATH)
	# Check if local model exists
	if generator_model_dir.exists():
		print(f"✅ Loading local model from {generator_model_dir}")
		tokenizer = AutoTokenizer.from_pretrained(generator_model_dir)
		model = AutoModelForCausalLM.from_pretrained(generator_model_dir, device_map="auto", quantization_config=bnb_config)
	else:
		print(f"⬇️ Downloading {GENERATOR_MODEL_NAME} from Hugging Face...")
		tokenizer = AutoTokenizer.from_pretrained(GENERATOR_MODEL_NAME)
		model = AutoModelForCausalLM.from_pretrained(GENERATOR_MODEL_NAME, device_map="auto", quantization_config=bnb_config)

		# Save both tokenizer and model locally
		generator_model_dir.mkdir(parents=True, exist_ok=True)
		tokenizer.save_pretrained(generator_model_dir)
		model.save_pretrained(generator_model_dir)
		print(f"💾 Model saved locally at {generator_model_dir}")

	tokenizer.pad_token = tokenizer.eos_token

	if not quantized:
		model = model.to(device)

	return tokenizer, model

def generate_answer(query, tokenizer, model, max_new_tokens=512, temperature=0.7, top_p=0.9):
	docs = rag.rerank(query)
	
	messages = [{
		"role": "system",
		"content": "You are a helpful assistant that identifies misinformation and provides corrections. Ignore correct information. Respond with a JSON object in the format: generate a JSON object containing all instances of only incorrect statements and corresponding corrections in the form: { \"findings\": [{\"text\": \"misinformation here\", \"correction\": \"correct information here\"}]} "
	}]
	if docs:
		context_parts = [f"{i}. {doc['source']}: {doc['text'][:1000]}..." 
						for i, doc in enumerate(docs, 1)]
		messages.append({
			"role": "system",
			"content": "Here are some additional documents for additional context you can reference." + "\n".join(context_parts)
		})
	messages.append({
		"role": "user",
		"content": "Query:\n\"" + query + "...\"\n\n Your JSON output begins now: " 
	})

	print(f"Query: {query}\n")
	print(messages)
	
	# Apply chat template and tokenize
	inputs = tokenizer.apply_chat_template(
		messages,
		add_generation_prompt=True,
		tokenize=True,
		return_dict=True,
		return_tensors="pt",
	).to(device)
	
	# Set pad token if not already set
	if tokenizer.pad_token_id is None:
		tokenizer.pad_token_id = tokenizer.eos_token_id
	model.config.pad_token_id = tokenizer.eos_token_id
	 
	print("Begin generating answer:")
	start_time = time.time() 
	
	with torch.no_grad():
		outputs = model.generate(
			**inputs,  # Unpack the input dictionary
			max_new_tokens=max_new_tokens,
			do_sample=True,
			temperature=temperature,
			top_p=top_p,
			pad_token_id=tokenizer.pad_token_id,
		)
	
	end_time = time.time() 
	print(f"✅ Answer generated in {(end_time-start_time):.2f} seconds")
	
	# Decode only the newly generated tokens (skip the input prompt)
	generated_text = tokenizer.decode(outputs[0][inputs['input_ids'].shape[1]:], skip_special_tokens=True)

	start_idx = generated_text.find('{')
	end_idx = generated_text.rfind('}')
	
	if start_idx != -1 and end_idx != -1 and start_idx < end_idx:
		generated_text = generated_text[start_idx:end_idx + 1]
	
	try:
		result_json = json.loads(generated_text)
	except:
		try:
			result_json = json.loads(generated_text + '}')
		except:
			try:
				result_json = json.loads(generated_text + ']}')
			except:
				print('Error converting to json')
				result_json = {'findings': []}

	return result_json, [doc['source'] for doc in docs]
	