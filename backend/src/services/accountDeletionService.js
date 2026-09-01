'use strict';

const pool = require('../config/db');
const { defaultStore: aiSessionStore } = require('./aiSessionStore');

async function deleteAccount(userId, options = {}) {
  const database = options.pool || pool;
  const sessionStore = options.sessionStore || aiSessionStore;
  const connection = await database.getConnection();

  try {
    await connection.beginTransaction();

    const [users] = await connection.query(
      'SELECT id FROM users WHERE id = ? FOR UPDATE',
      [userId],
    );
    if (users.length === 0) {
      await connection.rollback();
      return { deleted: false };
    }

    await connection.query(
      `UPDATE courses AS forked
       INNER JOIN courses AS original
         ON forked.forked_from_course_id = original.id
       SET forked.forked_from_author_id = NULL,
           forked.forked_from_author_deleted = TRUE
       WHERE original.user_id = ?`,
      [userId],
    );

    const [result] = await connection.query(
      'DELETE FROM users WHERE id = ?',
      [userId],
    );
    if (result.affectedRows !== 1) {
      throw new Error('ACCOUNT_DELETE_ROW_COUNT_MISMATCH');
    }

    await connection.commit();
    sessionStore.removeAllForUser(userId);
    return { deleted: true };
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // Preserve the original deletion error when rollback itself fails.
    }
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  deleteAccount,
};
