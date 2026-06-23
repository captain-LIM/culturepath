import 'package:flutter/material.dart';
import '../../../../core/theme/app_theme.dart';
import '../../data/place_item.dart';
import '../../data/course_repository.dart';

class PlaceSearchSheet extends StatefulWidget {
  final void Function(PlaceItem) onPlaceSelected;

  const PlaceSearchSheet({super.key, required this.onPlaceSelected});

  @override
  State<PlaceSearchSheet> createState() => _PlaceSearchSheetState();
}

class _PlaceSearchSheetState extends State<PlaceSearchSheet> {
  final _searchCtrl = TextEditingController();
  final _repo = CourseRepository();
  List<PlaceItem> _results = [];
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    _search('');
    _searchCtrl.addListener(() => _search(_searchCtrl.text));
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _search(String q) async {
    setState(() => _loading = true);
    try {
      final places = await _repo.searchPlaces(q);
      if (mounted) setState(() { _results = places; _loading = false; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.75,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      expand: false,
      builder: (context, scrollController) {
        return Column(
          children: [
            _buildHandle(),
            _buildSearchBar(),
            const Divider(height: 1),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _results.isEmpty
                      ? Center(
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.search_off, size: 40, color: Colors.grey.shade400),
                              const SizedBox(height: 8),
                              Text('검색 결과가 없습니다',
                                  style: TextStyle(color: Colors.grey.shade500)),
                            ],
                          ),
                        )
                      : ListView.builder(
                          controller: scrollController,
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          itemCount: _results.length,
                          itemBuilder: (_, i) => _PlaceResultTile(
                            place: _results[i],
                            onTap: () {
                              widget.onPlaceSelected(_results[i]);
                              Navigator.pop(context);
                            },
                          ),
                        ),
            ),
          ],
        );
      },
    );
  }

  Widget _buildHandle() {
    return Padding(
      padding: const EdgeInsets.only(top: 12, bottom: 8),
      child: Column(
        children: [
          Container(
            width: 36,
            height: 4,
            decoration: BoxDecoration(
              color: Colors.grey.shade300,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const SizedBox(height: 12),
          const Text(
            '장소 추가',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppColors.primary),
          ),
        ],
      ),
    );
  }

  Widget _buildSearchBar() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
      child: TextField(
        controller: _searchCtrl,
        autofocus: true,
        decoration: InputDecoration(
          hintText: '장소 이름, 주소로 검색',
          hintStyle: TextStyle(color: Colors.grey.shade400, fontSize: 14),
          prefixIcon: Icon(Icons.search, color: Colors.grey.shade400),
          suffixIcon: _searchCtrl.text.isNotEmpty
              ? IconButton(
                  icon: const Icon(Icons.clear, size: 18),
                  onPressed: () => _searchCtrl.clear(),
                )
              : null,
          filled: true,
          fillColor: Colors.grey.shade100,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide.none,
          ),
          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        ),
      ),
    );
  }
}

class _PlaceResultTile extends StatelessWidget {
  final PlaceItem place;
  final VoidCallback onTap;

  const _PlaceResultTile({required this.place, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return ListTile(
      onTap: onTap,
      contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 4),
      leading: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          color: AppColors.primary.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(10),
        ),
        child: const Icon(Icons.place_outlined, color: AppColors.primary, size: 20),
      ),
      title: Text(
        place.title,
        style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.primary),
      ),
      subtitle: Text(
        '${place.region != null ? "[${place.region}] " : ""}${place.category} · ${place.address}',
        style: TextStyle(fontSize: 11, color: Colors.grey.shade500),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
      trailing: Icon(Icons.add_circle_outline, color: AppColors.accent, size: 22),
    );
  }
}
