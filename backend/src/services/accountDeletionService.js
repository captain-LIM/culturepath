'use strict';

const pool = require('../config/db');
const { defaultStore: aiSessionStore } = require('./aiSessionStore');

async function lockAccountForDeletion(connection, userId) {
  const [users] = await connection.query(
    'SELECT id FROM users WHERE id = ? FOR UPDATE',
    [userId],
  );
  return users.length > 0;
}

async function deleteLockedAccountData(connection, userId) {
  await connection.query(
    `UPDATE courses AS forked
     INNER JOIN courses AS original
       ON forked.forked_from_course_id = original.id
     SET forked.forked_from_author_id = NULL,
         forked.forked_from_author_deleted = TRUE
     WHERE original.user_id = ?`,
    [userId],
  );

  await connection.query(
    'DELETE FROM ai_content_reports WHERE user_id = ?',
    [userId],
  );

  const [result] = await connection.query(
    'DELETE FROM users WHERE id = ?',
    [userId],
  );
  if (result.affectedRows !== 1) {
    throw new Error('ACCOUNT_DELETE_ROW_COUNT_MISMATCH');
  }
}

async function deleteAccountDataInTransaction(connection, userId) {
  const exists = await lockAccountForDeletion(connection, userId);
  if (!exists) return { deleted: false };
  await deleteLockedAccountData(connection, userId);
  return { deleted: true };
}

async function deleteAccount(userId, options = {}) {
  const database = options.pool || pool;
  const sessionStore = options.sessionStore || aiSessionStore;
  const connection = await database.getConnection();

  try {
    await connection.beginTransaction();

    const result = await deleteAccountDataInTransaction(connection, userId);
    if (!result.deleted) {
      await connection.rollback();
      return { deleted: false };
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
  lockAccountForDeletion,
  deleteLockedAccountData,
  deleteAccountDataInTransaction,
  deleteAccount,
};
