const express = require('express');
const Story = require('../models/Story');

const router = express.Router();

const STORY_EXPIRY_HOURS = 24;

// Create a new story
router.post('/', async (req, res) => {
  try {
    const { imageUrl, caption } = req.body;
    const userId = req.user._id;

    console.log('=== CREATE STORY ===');
    console.log('User ID:', userId);
    console.log('Image URL:', imageUrl);
    console.log('Caption:', caption);

    if (!imageUrl) {
      console.log('No image URL provided');
      return res.status(400).json({ error: 'Image URL is required' });
    }

    const expiresAt = new Date(Date.now() + STORY_EXPIRY_HOURS * 60 * 60 * 1000);
    console.log('Expires at:', expiresAt);

    const story = await Story.create({
      userId,
      imageUrl,
      caption: caption || '',
      expiresAt,
    });

    console.log('Story created successfully:', story._id);
    res.status(201).json(story.toJSON());
  } catch (err) {
    console.error('Error creating story:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get user's stories
router.get('/user/:userId', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    let userId;

    try {
      userId = new mongoose.Types.ObjectId(req.params.userId);
    } catch (e) {
      console.log('Invalid userId format:', req.params.userId);
      return res.json([]);
    }

    const stories = await Story.find({
      userId,
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });

    res.json(stories.map(s => s.toJSON()));
  } catch (err) {
    console.error('Error fetching user stories:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get stories from multiple users
router.post('/users', async (req, res) => {
  try {
    const { userIds } = req.body;

    console.log('=== GET STORIES FROM USERS ===');
    console.log('Received userIds:', userIds);

    if (!Array.isArray(userIds) || userIds.length === 0) {
      console.log('No userIds provided');
      return res.json([]);
    }

    const mongoose = require('mongoose');
    const objectIds = userIds.map(id => {
      try {
        const objectId = new mongoose.Types.ObjectId(id);
        console.log('Converted', id, 'to ObjectId:', objectId);
        return objectId;
      } catch (e) {
        console.log('Failed to convert', id, 'error:', e.message);
        return id;
      }
    });

    console.log('ObjectIds to query:', objectIds);

    const stories = await Story.find({
      userId: { $in: objectIds },
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });

    console.log('Stories found:', stories.length);
    res.json(stories.map(s => s.toJSON()));
  } catch (err) {
    console.error('Error fetching stories from users:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete a story
router.delete('/:storyId', async (req, res) => {
  try {
    const story = await Story.findById(req.params.storyId);

    if (!story) {
      return res.status(404).json({ error: 'Story not found' });
    }

    // Check if user owns the story
    if (story.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized to delete this story' });
    }

    await Story.findByIdAndDelete(req.params.storyId);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting story:', err);
    res.status(500).json({ error: err.message });
  }
});

// Cleanup expired stories
router.post('/cleanup', async (req, res) => {
  try {
    const result = await Story.deleteMany({ expiresAt: { $lt: new Date() } });
    res.json({ deleted: result.deletedCount });
  } catch (err) {
    console.error('Error cleaning up stories:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
