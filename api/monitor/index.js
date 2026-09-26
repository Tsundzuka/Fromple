// /api/process-video/index.js

const { createClient } = require('@supabase/supabase-js');
const { ApifyClient } = require('apify-client');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const apifyClient = new ApifyClient({
    token: process.env.APIFY_TOKEN,
});

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { upload_id } = req.body;

        if (!upload_id) {
            return res.status(400).json({ error: 'upload_id is required' });
        }

        // Get the upload record
        const { data: upload, error: fetchError } = await supabase
            .from('uploads')
            .select('*')
            .eq('id', upload_id)
            .single();

        if (fetchError || !upload) {
            return res.status(404).json({ error: 'Upload not found' });
        }

        if (upload.status !== 'pending') {
            return res.status(200).json({ 
                success: true,
                message: 'Upload already processed',
                status: upload.status 
            });
        }

        console.log(`🔄 Processing video: ${upload.video_url}`);

        // Extract video ID from YouTube URL
        const videoUrl = upload.video_url;
        const videoIdMatch = videoUrl.match(/[?&]v=([^&]+)/);
        
        if (!videoIdMatch) {
            throw new Error('Could not extract YouTube video ID from URL: ' + videoUrl);
        }

        const videoId = videoIdMatch[1];
        console.log(`📹 Video ID: ${videoId}`);

        // Update status to processing
        await supabase
            .from('uploads')
            .update({ status: 'processing' })
            .eq('id', upload_id);

        console.log('📤 Calling Apify to fetch transcript...');

        // Run Apify actor
        const run = await apifyClient.actor('foudhil/actor-youtube-transcript').call({
            videoUrl: videoUrl,
            proxyConfiguration: { useApifyProxy: true }
        });

        // Get results
        const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();
        
        if (!items || items.length === 0) {
            throw new Error('No transcript returned from Apify');
        }

        // Combine transcript items
        const transcription = items.map(item => item.transcript || item.text || '').join(' ');

        if (!transcription.trim()) {
            throw new Error('Transcript is empty');
        }

        console.log(`✅ Transcription completed (${transcription.length} characters)`);

        // Update upload record with transcription
        await supabase
            .from('uploads')
            .update({
                content_text: transcription,
                status: 'completed',
                error_message: null
            })
            .eq('id', upload_id);

        return res.status(200).json({
            success: true,
            transcription: transcription,
            message: 'Video processed successfully'
        });

    } catch (error) {
        console.error('❌ Video processing error:', error);
        console.error('Error stack:', error.stack);
        
        // Update error status
        if (req.body.upload_id) {
            await supabase
                .from('uploads')
                .update({
                    status: 'failed',
                    error_message: error.message
                })
                .eq('id', req.body.upload_id);
        }

        return res.status(500).json({
            error: 'Video processing failed',
            details: error.message
        });
    }
};
