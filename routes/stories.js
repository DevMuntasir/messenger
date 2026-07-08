const express = require('express');
const Story = require('../models/Story');

const router = express.Router();

const STORY_EXPIRY_HOURS = 24;

// Create a new story
router.post('/', async (req, res) => {
  try {
    const { imageUrl, caption } = req.body;
    const userId = req.user._id;

    if (!imageUrl) {
      return res.status(400).json({ error: 'Image URL is required' });
    }

    const expiresAt = new Date(Date.now() + STORY_EXPIRY_HOURS * 60 * 60 * 1000);

    const story = await Story.create({
      userId,
      imageUrl,
      caption: caption || '',
      expiresAt,
    });

    res.status(201).json(story.toJSON());
  } catch (err) {
    console.error('Error creating story:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get user's stories
router.get('/user/:userId', async (req, res) => {
  try {
    const stories = await Story.find({
      userId: req.params.userId,
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

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.json([]);
    }

    const stories = await Story.find({
      userId: { $in: userIds },
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });

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
