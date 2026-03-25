import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';

dotenv.config();

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

if (process.env.CLAUDE_API_KEY) {
  console.log('✅ Claude AI API configured');
} else {
  console.log('❌ Claude AI API key missing - AI Excel parsing will not work');
}

export default anthropic;
