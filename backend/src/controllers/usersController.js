'use strict';

const { deleteAccount } = require('../services/accountDeletionService');

async function deleteMyAccount(req, res) {
  if (req.body?.confirmation !== 'DELETE') {
    return res.status(400).json({
      message: '회원 탈퇴 확인 값이 올바르지 않습니다.',
    });
  }

  try {
    const result = await deleteAccount(req.user.id);
    if (!result.deleted) {
      return res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });
    }
    return res.status(204).send();
  } catch (error) {
    console.error('계정 삭제 실패:', {
      errorName: error?.name || 'Error',
      code: error?.code || null,
    });
    return res.status(500).json({ message: '계정을 삭제하지 못했습니다.' });
  }
}

module.exports = { deleteMyAccount };
