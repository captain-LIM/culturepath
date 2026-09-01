'use strict';

const DELETED_COURSE_COMPAT_ID = 0;
const DELETED_AUTHOR_COMPAT_ID = 'deleted-user';

function buildForkedFrom(course) {
  const authorDeleted = Boolean(course.forked_from_author_deleted);
  const hasProvenance =
    course.forked_from_course_id != null ||
    course.forked_from_title != null ||
    course.forked_from_author_id != null ||
    authorDeleted;

  if (!hasProvenance) return null;

  return {
    courseId: course.forked_from_course_id == null
      ? DELETED_COURSE_COMPAT_ID
      : Number(course.forked_from_course_id),
    title: String(course.forked_from_title || ''),
    authorId: authorDeleted
      ? DELETED_AUTHOR_COMPAT_ID
      : String(course.forked_from_author_id || ''),
    authorDeleted,
  };
}

module.exports = {
  DELETED_AUTHOR_COMPAT_ID,
  DELETED_COURSE_COMPAT_ID,
  buildForkedFrom,
};
