"""
Convert Llama 3.2 3B model to Executorch format (.pte)
This script downloads and converts the model for use with react-native-executorch
"""

import torch
from transformers import AutoModel, AutoTokenizer
import os
import sys

# Use the Python installation specified
PYTHON_PATH = r"C:\Users\Shane\AppData\Local\Programs\Python\Python312\python.exe"

def convert_llama_to_executorch():
    """
    Convert Llama 3.2 3B Instruct model to Executorch format
    """
    print("=" * 60)
    print("Llama 3.2 3B to Executorch Converter")
    print("=" * 60)
    
    model_name = "meta-llama/Llama-3.2-3B-Instruct"
    output_dir = "assets/models"
    output_file = os.path.join(output_dir, "llama-3.2-3b-instruct.pte")
    
    # Create output directory
    os.makedirs(output_dir, exist_ok=True)
    
    print(f"\n1. Loading model: {model_name}")
    print("   This may take a while and requires significant RAM...")
    
    try:
        # Load tokenizer
        print("\n   Loading tokenizer...")
        tokenizer = AutoTokenizer.from_pretrained(model_name)
        
        # Load model
        print("   Loading model (this may take several minutes)...")
        model = AutoModel.from_pretrained(
            model_name,
            torch_dtype=torch.float16,  # Use FP16 to reduce memory
            device_map="auto"
        )
        model.eval()
        
        print("   ✓ Model loaded successfully")
        
    except Exception as e:
        print(f"\n❌ Error loading model: {e}")
        print("\nNote: You may need to:")
        print("  1. Accept the model license on Hugging Face")
        print("  2. Set up Hugging Face token: huggingface-cli login")
        print("  3. Have sufficient RAM (16GB+ recommended)")
        return False
    
    print(f"\n2. Converting to Executorch format...")
    
    try:
        # Create example input for export
        # Llama models expect token IDs as input
        example_text = "Hello, how are you?"
        example_inputs = tokenizer(example_text, return_tensors="pt")
        input_ids = example_inputs["input_ids"]
        
        print(f"   Example input shape: {input_ids.shape}")
        
        # Export to Executorch
        # Note: This is a simplified export - full conversion may require
        # additional steps for quantization and optimization
        print("   Exporting model (this may take several minutes)...")
        
        # For Executorch, we need to use torch.export
        exported_program = torch.export.export(model, (input_ids,))
        
        # Convert to Executorch format
        # This requires Executorch's conversion tools
        print("   Converting to .pte format...")
        
        # Save as .pte file
        # Note: Full Executorch conversion requires additional steps
        # This is a placeholder - you may need to use Executorch's CLI tools
        print("\n⚠️  Note: Full Executorch conversion requires:")
        print("   - Executorch's export tools")
        print("   - Quantization (recommended for mobile)")
        print("   - Backend optimization (XNNPACK, etc.)")
        print("\n   For now, saving PyTorch model...")
        
        # Save PyTorch model as fallback
        torch.save({
            'model_state_dict': model.state_dict(),
            'tokenizer': tokenizer,
        }, output_file.replace('.pte', '.pt'))
        
        print(f"\n✓ Model saved to: {output_file.replace('.pte', '.pt')}")
        print("\n⚠️  This is a PyTorch model, not Executorch format.")
        print("   For Executorch conversion, you'll need to:")
        print("   1. Use Executorch's export tools")
        print("   2. Or download a pre-converted model")
        print("   3. Or use react-native-executorch's built-in conversion")
        
        return True
        
    except Exception as e:
        print(f"\n❌ Error during conversion: {e}")
        import traceback
        traceback.print_exc()
        return False

def download_preconverted_model():
    """
    Instructions for downloading pre-converted models
    """
    print("\n" + "=" * 60)
    print("Alternative: Download Pre-converted Model")
    print("=" * 60)
    print("\nFor easier setup, consider downloading a pre-converted model:")
    print("\n1. Check react-native-executorch documentation for pre-converted models")
    print("2. Look for .pte files on Hugging Face:")
    print("   - Search for 'llama executorch' or 'llama pte'")
    print("   - Check: https://huggingface.co/models?search=executorch")
    print("\n3. Download and place in: assets/models/")
    print("\n4. Use with react-native-executorch's useLLM hook")

if __name__ == "__main__":
    print("\nStarting conversion process...")
    print("This will download ~6GB model and convert it.")
    print("Make sure you have:")
    print("  - Sufficient disk space (10GB+)")
    print("  - Sufficient RAM (16GB+)")
    print("  - Hugging Face account with model access")
    print("\n")
    
    response = input("Continue? (y/n): ")
    if response.lower() != 'y':
        print("Cancelled.")
        sys.exit(0)
    
    success = convert_llama_to_executorch()
    
    if not success:
        download_preconverted_model()


