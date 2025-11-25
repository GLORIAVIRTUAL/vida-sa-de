// Utilitário para controlar rate limit - BALANCEADO entre velocidade e segurança
class ApiThrottle {
  constructor(maxConcurrent = 2, delayBetweenCalls = 500) {
    this.maxConcurrent = maxConcurrent;
    this.delayBetweenCalls = delayBetweenCalls;
    this.queue = [];
    this.running = 0;
    this.lastCallTime = 0;
  }

  async execute(apiCall) {
    return new Promise((resolve, reject) => {
      this.queue.push({ apiCall, resolve, reject });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.running >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const { apiCall, resolve, reject } = this.queue.shift();
    this.running++;

    try {
      const now = Date.now();
      const timeSinceLastCall = now - this.lastCallTime;
      if (timeSinceLastCall < this.delayBetweenCalls) {
        await new Promise(res => setTimeout(res, this.delayBetweenCalls - timeSinceLastCall));
      }

      this.lastCallTime = Date.now();
      const result = await apiCall();
      resolve(result);
    } catch (error) {
      if (error.message?.includes('429') || error.message?.includes('Rate limit')) {
        console.warn('⚠️ Rate limit! Aguardando 3s...');
        await new Promise(res => setTimeout(res, 3000));
        try {
          const result = await apiCall();
          resolve(result);
        } catch (retryError) {
          reject(retryError);
        }
      } else {
        reject(error);
      }
    } finally {
      this.running--;
      setTimeout(() => this.processQueue(), 50);
    }
  }
}

// BALANCEADO: 2 requisições simultâneas, 500ms entre elas
export const apiThrottle = new ApiThrottle(2, 500);

export const safeApiCall = async (entityCall, fallback = []) => {
  try {
    return await apiThrottle.execute(entityCall);
  } catch (error) {
    console.error('❌ Erro na chamada API:', error);
    return fallback;
  }
};

// Cache com duração de 2 minutos
const cache = new Map();
const CACHE_DURATION = 120000; // 2 minutos

export const cachedApiCall = async (cacheKey, entityCall, fallback = []) => {
  const cached = cache.get(cacheKey);
  
  if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
    console.log(`✅ Cache: ${cacheKey}`);
    return cached.data;
  }
  
  try {
    const data = await apiThrottle.execute(entityCall);
    cache.set(cacheKey, { data, timestamp: Date.now() });
    return data;
  } catch (error) {
    console.error(`❌ Erro ao carregar ${cacheKey}:`, error);
    return fallback;
  }
};

export const clearCache = (cacheKey) => {
  if (cacheKey) {
    cache.delete(cacheKey);
  } else {
    cache.clear();
  }
};