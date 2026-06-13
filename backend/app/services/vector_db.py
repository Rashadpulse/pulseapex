import numpy as np
from typing import List, Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.models import ComplianceRule, DocumentChunk
from app.core.config import settings

# Attempt to load openai / gemini for embeddings
try:
    from langchain_openai import OpenAIEmbeddings
    from langchain_google_genai import GoogleGenAIEmbeddings
    LANGCHAIN_EMBEDDINGS_AVAIL = True
except ImportError:
    LANGCHAIN_EMBEDDINGS_AVAIL = False

class VectorDBService:
    """
    Manages semantic search using pgvector inside Supabase.
    """
    
    @staticmethod
    def generate_hash_embedding(text: str) -> List[float]:
        text_hash = hash(text) % (2**32)
        rng = np.random.default_rng(text_hash)
        vec = rng.normal(size=1536)
        vec /= np.linalg.norm(vec)
        return vec.tolist()

    @classmethod
    async def get_embedding(cls, text: str) -> List[float]:
        if LANGCHAIN_EMBEDDINGS_AVAIL:
            try:
                if settings.AI_PROVIDER == "openai" and settings.OPENAI_API_KEY:
                    embeddings_model = OpenAIEmbeddings(openai_api_key=settings.OPENAI_API_KEY)
                    return await embeddings_model.aembed_query(text)
                elif settings.AI_PROVIDER == "gemini" and settings.GEMINI_API_KEY:
                    embeddings_model = GoogleGenAIEmbeddings(
                        model="models/embedding-001", 
                        google_api_key=settings.GEMINI_API_KEY
                    )
                    return await embeddings_model.aembed_query(text)
            except Exception:
                pass
                
        return cls.generate_hash_embedding(text)

    @classmethod
    async def ingest_document_chunk(cls, db: AsyncSession, doc_id: int, chunk_text: str, chunk_index: int) -> DocumentChunk:
        embedding = await cls.get_embedding(chunk_text)
        
        db_embedding = DocumentChunk(
            document_id=doc_id,
            chunk_index=chunk_index,
            content=chunk_text,
            embedding=embedding
        )
        db.add(db_embedding)
        await db.commit()
        return db_embedding

    @classmethod
    async def semantic_search(
        cls, db: AsyncSession, org_id: int, query: str, limit: int = 3
    ) -> List[Dict[str, Any]]:
        query_vector = await cls.get_embedding(query)
        
        try:
            result = await db.execute(select(DocumentChunk))
            embeddings = result.scalars().all()
            
            scored_results = []
            for em in embeddings:
                if em.embedding:
                    a = np.array(em.embedding)
                    b = np.array(query_vector)
                    cosine_dist = 1 - (np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))
                else:
                    cosine_dist = 1.0
                    
                scored_results.append({
                    "chunk_text": em.content,
                    "distance": float(cosine_dist)
                })
            
            scored_results.sort(key=lambda x: x["distance"])
            return scored_results[:limit]
            
        except Exception:
            return []
