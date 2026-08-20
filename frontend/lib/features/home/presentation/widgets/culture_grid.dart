import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../data/culture_model.dart';
import '../../data/cultures_repository.dart';
import 'culture_card.dart';

final culturesProvider = FutureProvider<List<CultureCategory>>((ref) {
  return CulturesRepository().getCultures();
});

class CultureGrid extends ConsumerWidget {
  const CultureGrid({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    EasyLocalization.of(context);
    final culturesAsync = ref.watch(culturesProvider);

    return culturesAsync.when(
      loading: () => const SliverToBoxAdapter(
        child: SizedBox(height: 240, child: Center(child: CircularProgressIndicator())),
      ),
      error: (e, _) => SliverToBoxAdapter(
        child: SizedBox(
          height: 200,
          child: Center(child: Text('culture_load_error'.tr(), textAlign: TextAlign.center)),
        ),
      ),
      data: (cultures) => SliverToBoxAdapter(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: cultures.length > 10 ? 10 : cultures.length,
            gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              mainAxisSpacing: 8,
              crossAxisSpacing: 8,
              mainAxisExtent: MediaQuery.textScalerOf(context).scale(1) >= 1.8
                  ? 144
                  : 108,
            ),
            itemBuilder: (context, index) => CultureCard(
              culture: cultures[index],
              onTap: () => context.push('/cultures/${cultures[index].id}', extra: cultures[index]),
            ),
          ),
        ),
      ),
    );
  }
}
