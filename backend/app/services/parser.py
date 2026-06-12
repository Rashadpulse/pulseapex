import os
import pandas as pd
from docx import Document as DocxDocument
from pypdf import PdfReader
from typing import Dict, Any

class DocumentParserService:
    """
    Parses various document types (PDF, DOCX, XLSX, CSV, TXT) 
    and extracts clean text and structural metrics.
    """
    
    @staticmethod
    def parse_pdf(file_path: str) -> str:
        text = ""
        try:
            reader = PdfReader(file_path)
            for page in reader.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
        except Exception as e:
            text = f"Error parsing PDF: {str(e)}"
        return text

    @staticmethod
    def parse_docx(file_path: str) -> str:
        text = ""
        try:
            doc = DocxDocument(file_path)
            for paragraph in doc.paragraphs:
                text += paragraph.text + "\n"
        except Exception as e:
            text = f"Error parsing DOCX: {str(e)}"
        return text

    @staticmethod
    def parse_excel(file_path: str) -> str:
        try:
            # Read all sheets into dataframes
            xlsx = pd.ExcelFile(file_path)
            sheets_data = []
            for sheet_name in xlsx.sheet_names:
                df = pd.read_excel(file_path, sheet_name=sheet_name)
                sheets_data.append(f"--- Sheet: {sheet_name} ---\n{df.to_string()}\n")
            return "\n".join(sheets_data)
        except Exception as e:
            return f"Error parsing Excel: {str(e)}"

    @staticmethod
    def parse_csv(file_path: str) -> str:
        try:
            df = pd.read_csv(file_path)
            return df.to_string()
        except Exception as e:
            return f"Error parsing CSV: {str(e)}"

    @classmethod
    def parse_document(cls, file_path: str, file_type: str) -> str:
        """
        Detects file type and routes to the appropriate parser.
        """
        if not os.path.exists(file_path):
            return "File not found on disk."
            
        file_type = file_type.upper()
        if "PDF" in file_type:
            return cls.parse_pdf(file_path)
        elif "DOCX" in file_type or "DOC" in file_type:
            return cls.parse_docx(file_path)
        elif "XLS" in file_type or "XLSX" in file_type:
            return cls.parse_excel(file_path)
        elif "CSV" in file_type:
            return cls.parse_csv(file_path)
        else:
            # Fallback to plain text reader
            try:
                with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                    return f.read()
            except Exception as e:
                return f"Error reading text file: {str(e)}"
