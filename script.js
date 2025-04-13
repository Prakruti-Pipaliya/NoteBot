import config from './config.js';

document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const tabBtns = document.querySelectorAll('.tab-btn');
    const modeBtns = document.querySelectorAll('.mode-btn');
    const lengthSlider = document.getElementById('lengthSlider');
    const inputNotes = document.getElementById('input-notes');
    const summarizeBtn = document.getElementById('summarize-btn');
    const downloadBtn = document.getElementById('download-btn');
    const summaryContent = document.getElementById('summary-content');
    const useAPIToggle = document.getElementById('useAPI');

    // Current state
    let currentMode = 'paragraph';
    let summaryLength = 30; // Default value
    let useAPI = useAPIToggle.checked;
    let currentSummary = '';

    // Tab switching
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });

            btn.classList.add('active');
            document.getElementById(`${btn.dataset.tab}-tab`).classList.add('active');
        });
    });

    // Mode selection
    modeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            modeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentMode = btn.dataset.mode;
        });
    });

    // Summary length slider
    lengthSlider.addEventListener('input', (e) => {
        summaryLength = e.target.value;
    });

    // API toggle
    useAPIToggle.addEventListener('change', (e) => {
        useAPI = e.target.checked;
        if (useAPI && !config.OPENAI_API_KEY) {
            alert('Please add your OpenAI API key in the config.js file.');
            e.target.checked = false;
            useAPI = false;
        }
    });

    // Summarize functionality
    summarizeBtn.addEventListener('click', async () => {
        const text = inputNotes.value;
        if (!text.trim()) {
            alert('Please enter some text to summarize');
            return;
        }

        summarizeBtn.textContent = 'Summarizing...';
        summarizeBtn.disabled = true;
        downloadBtn.disabled = true;

        try {
            const summary = await generateOpenAISummary(text, currentMode, summaryLength);
            currentSummary = summary;
            summaryContent.innerHTML = formatSummary(summary, currentMode);
            tabBtns[1].click(); // Switch to summary tab
            downloadBtn.disabled = false;
        } catch (error) {
            console.error('Summarization error:', error);
            alert('Error generating summary. Please try again.');
            const localSummary = generateLocalSummary(text, currentMode, summaryLength);
            currentSummary = localSummary;
            summaryContent.innerHTML = formatSummary(localSummary, currentMode);
        } finally {
            summarizeBtn.disabled = false;
            summarizeBtn.textContent = 'Summarize →';
        }
    });

    // Download functionality
    downloadBtn.addEventListener('click', () => {
        if (!currentSummary) {
            alert('Please generate a summary first');
            return;
        }

        const blob = new Blob([stripHtml(currentSummary)], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'summary.txt';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    });

    // Strip HTML tags for download
    function stripHtml(html) {
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        return tmp.textContent || tmp.innerText || '';
    }

    // OpenAI-based summary generation
    async function generateOpenAISummary(text, mode, length) {
        const { prompt, systemPrompt } = generatePrompt(text, mode, length);
        
        const response = await fetch(config.API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: config.MODEL,
                messages: [
                    {
                        role: "system",
                        content: systemPrompt
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: mode === 'custom' ? 0.7 : 0.5,
                max_tokens: Math.min(4000, text.length * 2),
                presence_penalty: 0.1,
                frequency_penalty: 0.1
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(`OpenAI API Error: ${error.error?.message || 'Unknown error'}`);
        }

        const result = await response.json();
        return result.choices[0].message.content.trim();
    }

    // Generate appropriate prompt based on mode and length
    function generatePrompt(text, mode, length) {
        const wordCount = text.split(/\s+/).length;
        const targetLength = Math.floor((wordCount * length) / 100);

        const systemPrompts = {
            paragraph: "You are an expert text summarizer that creates concise, coherent summaries while preserving the main ideas and key details. Your summaries are well-structured and maintain the original text's tone and context.",
            bullet: "You are an expert at extracting and organizing key points from text. You create clear, concise bullet points that capture the essential information and maintain hierarchical relationships between ideas.",
            custom: "You are an advanced text analyzer that identifies and extracts the most significant concepts, arguments, and supporting details from text. You focus on important terminology, critical statements, and key relationships between ideas."
        };

        const basePrompt = `Please summarize the following text. Target length: approximately ${targetLength} words.\n\nOriginal text:\n${text}\n\n`;
        
        const modeSpecificPrompts = {
            paragraph: "Create a coherent paragraph that flows naturally and maintains logical connections between ideas. The summary should be self-contained and readable as a standalone text.",
            bullet: "Create a bullet-point summary where:\n- Each point represents a distinct key concept or idea\n- Points are organized in a logical hierarchy\n- Use sub-bullets for supporting details when necessary\n- Each point should be clear and concise",
            custom: "Create a focused summary that:\n- Prioritizes key concepts, important statements, and critical arguments\n- Preserves technical terms and their relationships\n- Maintains the context of important ideas\n- Highlights cause-and-effect relationships"
        };

        return {
            systemPrompt: systemPrompts[mode],
            prompt: basePrompt + modeSpecificPrompts[mode]
        };
    }

    // Local summary generation (fallback)
    function generateLocalSummary(text, mode, length) {
        const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
        const totalSentences = sentences.length;
        const summaryLength = Math.max(1, Math.floor((totalSentences * length) / 100));
        
        switch(mode) {
            case 'paragraph':
                return sentences.slice(0, summaryLength).join(' ');
                
            case 'bullet':
                return sentences.slice(0, summaryLength);
                
            case 'custom':
                const keySentences = sentences
                    .filter(sentence => 
                        sentence.includes('important') || 
                        sentence.includes('key') || 
                        sentence.includes('significant'))
                    .slice(0, summaryLength);
                    
                return keySentences.length > 0 
                    ? keySentences
                    : sentences.slice(0, summaryLength);
        }
        
        return [];
    }

    // Format summary based on mode
    function formatSummary(summary, mode) {
        if (typeof summary === 'string') {
            if (mode === 'bullet' && !summary.includes('<li>')) {
                // If OpenAI didn't return HTML formatted bullets, format them
                const points = summary.split('\n').filter(point => point.trim());
                return `<ul>${points.map(point => `<li>${point.replace(/^[-•]\s*/, '')}</li>`).join('')}</ul>`;
            }
            return summary;
        }

        // Handle array of sentences
        switch(mode) {
            case 'bullet':
                return `<ul>${summary.map(sentence => `<li>${sentence.trim()}</li>`).join('')}</ul>`;
            default:
                return summary.join(' ');
        }
    }
}); 